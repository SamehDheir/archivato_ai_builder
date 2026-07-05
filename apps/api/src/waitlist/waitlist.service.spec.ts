import { WaitlistService } from './waitlist.service';
import { InMemoryWaitlistRepository } from './in-memory-waitlist.repository';

describe('WaitlistService', () => {
  let repo: InMemoryWaitlistRepository;
  let service: WaitlistService;

  beforeEach(() => {
    repo = new InMemoryWaitlistRepository();
    service = new WaitlistService(repo);
  });

  it('records a new signup and normalizes the email', async () => {
    const result = await service.join({ email: '  Founder@Example.com ' });
    expect(result).toEqual({ ok: true, alreadyJoined: false });
    expect(await repo.findByEmail('founder@example.com')).not.toBeNull();
    expect(await service.count()).toBe(1);
  });

  it('is idempotent — a duplicate (any casing) succeeds without a second row', async () => {
    await service.join({ email: 'founder@example.com' });
    const again = await service.join({ email: 'FOUNDER@example.com' });
    expect(again).toEqual({ ok: true, alreadyJoined: true });
    expect(await service.count()).toBe(1);
  });

  it('stores optional locale/source, capped', async () => {
    await service.join({
      email: 'a@b.com',
      locale: 'ar',
      source: 'waitlist-section',
    });
    const entry = await repo.findByEmail('a@b.com');
    expect(entry?.locale).toBe('ar');
    expect(entry?.source).toBe('waitlist-section');
  });
});
