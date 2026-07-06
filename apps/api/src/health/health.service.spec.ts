jest.mock('ioredis');

import Redis from 'ioredis';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

const RedisMock = Redis as unknown as jest.Mock;

function makeService(prisma: Partial<PrismaService>): HealthService {
  const config = {
    get: (_key: string, def?: unknown) => def,
  } as unknown as ConfigService;
  return new HealthService(prisma as PrismaService, config);
}

describe('HealthService.readiness', () => {
  let redisClient: {
    connect: jest.Mock;
    ping: jest.Mock;
    disconnect: jest.Mock;
  };

  beforeEach(() => {
    redisClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue('PONG'),
      disconnect: jest.fn(),
    };
    RedisMock.mockImplementation(() => redisClient);
  });

  it('reports ok when both the database and Redis are up', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ x: 1 }]) };
    const report = await makeService(prisma).readiness();

    expect(report.status).toBe('ok');
    expect(report.checks.database.status).toBe('up');
    expect(report.checks.redis.status).toBe('up');
    // The probe must always release its short-lived Redis connection.
    expect(redisClient.disconnect).toHaveBeenCalled();
  });

  it('reports error + database down when the DB query throws', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('connection refused')),
    };
    const report = await makeService(prisma).readiness();

    expect(report.status).toBe('error');
    expect(report.checks.database.status).toBe('down');
    expect(report.checks.redis.status).toBe('up');
  });

  it('reports error + redis down when the PING connection fails', async () => {
    redisClient.connect.mockRejectedValue(new Error('no redis'));
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) };
    const report = await makeService(prisma).readiness();

    expect(report.status).toBe('error');
    expect(report.checks.redis.status).toBe('down');
    expect(report.checks.database.status).toBe('up');
    expect(redisClient.disconnect).toHaveBeenCalled();
  });
});
