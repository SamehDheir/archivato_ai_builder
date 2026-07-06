import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

/** Health of a single upstream dependency. */
export interface DependencyHealth {
  status: 'up' | 'down';
  latencyMs?: number;
}

/** Aggregate readiness across all critical dependencies. */
export interface ReadinessReport {
  status: 'ok' | 'error';
  checks: {
    database: DependencyHealth;
    redis: DependencyHealth;
  };
}

/**
 * Dependency health checks behind the readiness probe. Each check is isolated
 * (a failure returns `down`, never throws) so the probe can report *which*
 * dependency is unhealthy and orchestrators can act on it.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Run every dependency check in parallel and aggregate the result. */
  async readiness(): Promise<ReadinessReport> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);
    const status =
      database.status === 'up' && redis.status === 'up' ? 'ok' : 'error';
    return { status, checks: { database, redis } };
  }

  /** Cheapest possible round-trip to Postgres. */
  private async checkDatabase(): Promise<DependencyHealth> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (err) {
      this.logger.error(`Database health check failed: ${(err as Error).message}`);
      return { status: 'down' };
    }
  }

  /**
   * PING Redis over a short-lived, non-retrying connection (a probe must fail
   * fast, not queue retries). We build our own client rather than borrow the
   * BullMQ queue so the check has no dependency on the jobs module.
   */
  private async checkRedis(): Promise<DependencyHealth> {
    const start = Date.now();
    const client = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: Number(this.config.get('REDIS_PORT') ?? 6379),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      // Never retry inside a health probe — report the failure immediately.
      retryStrategy: () => null,
    });
    try {
      await client.connect();
      await client.ping();
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (err) {
      this.logger.error(`Redis health check failed: ${(err as Error).message}`);
      return { status: 'down' };
    } finally {
      client.disconnect();
    }
  }
}
