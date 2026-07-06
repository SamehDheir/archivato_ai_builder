import { Controller, Get, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { HealthService, type ReadinessReport } from './health.service';

/**
 * Health probes for load balancers / container orchestrators. Public and
 * un-throttled (probes poll frequently). Excluded from the global `/api` prefix
 * in `main.ts`, so they live at the root: `GET /health`, `GET /health/ready`.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness: the process is up and serving. No dependency checks. */
  @Get()
  liveness(): { status: 'ok'; uptime: number } {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  /**
   * Readiness: critical dependencies (DB + Redis) are reachable. Returns 503
   * when any is down so traffic is drained until the service recovers.
   */
  @Get('ready')
  async readiness(
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReadinessReport> {
    const report = await this.health.readiness();
    res.status(report.status === 'ok' ? 200 : 503);
    return report;
  }
}
