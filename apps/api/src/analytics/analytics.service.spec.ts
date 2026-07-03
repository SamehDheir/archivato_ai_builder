import { AnalyticsService } from './analytics.service';
import { InMemoryAnalyticsEventRepository } from './in-memory-analytics-event.repository';

describe('AnalyticsService', () => {
  let repo: InMemoryAnalyticsEventRepository;
  let service: AnalyticsService;

  beforeEach(() => {
    repo = new InMemoryAnalyticsEventRepository();
    service = new AnalyticsService(repo);
  });

  it('records events and counts them by type', async () => {
    await service.record({ type: 'pageview', path: '/' });
    await service.record({ type: 'pageview', path: '/pricing' });
    await service.record({ type: 'signup', userId: 'u1' });

    expect(await service.countByType('pageview')).toBe(2);
    expect(await service.countByType('signup')).toBe(1);
    expect(await service.countByType('login')).toBe(0);
  });

  it('findSince returns only events at/after the cutoff, oldest first', async () => {
    await service.record({ type: 'pageview', path: '/a' });
    await service.record({ type: 'pageview', path: '/b' });

    const all = await service.findSince(new Date(Date.now() - 1000));
    expect(all.map((e) => e.path)).toEqual(['/a', '/b']);

    const future = await service.findSince(new Date(Date.now() + 60_000));
    expect(future).toHaveLength(0);
  });

  it('recordSafe never throws even if the store fails', async () => {
    const failing = {
      create: async () => {
        throw new Error('db down');
      },
    } as unknown as InMemoryAnalyticsEventRepository;
    const svc = new AnalyticsService(failing);
    await expect(
      svc.recordSafe({ type: 'login', userId: 'u1' }),
    ).resolves.toBeUndefined();
  });
});
