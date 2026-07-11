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

  describe('list (admin view)', () => {
    async function seed(n: number) {
      for (let i = 0; i < n; i++) {
        await service.join({ email: `user${i}@example.com`, source: 'hero' });
        // Ensure distinct, ordered createdAt timestamps.
        await new Promise((r) => setTimeout(r, 1));
      }
    }

    it('returns entries newest-first as client-safe views (ISO createdAt)', async () => {
      await seed(3);
      const page = await service.list(1, 25);
      expect(page.total).toBe(3);
      expect(page.entries).toHaveLength(3);
      expect(page.entries[0].email).toBe('user2@example.com'); // newest first
      expect(typeof page.entries[0].createdAt).toBe('string');
      expect(page.entries[0].createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });

    it('paginates with a clamped page size and reports the full total', async () => {
      await seed(5);
      const page = await service.list(2, 2);
      expect(page.total).toBe(5); // total is unaffected by paging
      expect(page.entries).toHaveLength(2);
      // Page 2 of size 2 over [4,3,2,1,0] → [2,1].
      expect(page.entries.map((e) => e.email)).toEqual([
        'user2@example.com',
        'user1@example.com',
      ]);
    });

    it('filters by email/source (case-insensitive) in `q`', async () => {
      await service.join({ email: 'ALICE@example.com', source: 'twitter' });
      await service.join({ email: 'bob@example.com', source: 'hero' });
      const byEmail = await service.list(1, 25, 'alice');
      expect(byEmail.total).toBe(1);
      expect(byEmail.entries[0].email).toBe('alice@example.com');
      const bySource = await service.list(1, 25, 'TWITTER');
      expect(bySource.total).toBe(1);
      expect(bySource.entries[0].email).toBe('alice@example.com');
    });

    it('clamps out-of-range page/size inputs', async () => {
      await seed(3);
      // page 0 → treated as page 1; huge size is capped but still returns all 3.
      const page = await service.list(0, 100000);
      expect(page.entries).toHaveLength(3);
      expect(page.total).toBe(3);
    });

    it('captures the resolved country and exposes it on the view', async () => {
      await service.join({ email: 'geo@example.com' }, 'DE');
      const page = await service.list(1, 25, 'geo');
      expect(page.entries[0].country).toBe('DE');
    });

    it('defaults country to null when none is resolved', async () => {
      await service.join({ email: 'nogeo@example.com' });
      const page = await service.list(1, 25, 'nogeo');
      expect(page.entries[0].country).toBeNull();
    });
  });
});
