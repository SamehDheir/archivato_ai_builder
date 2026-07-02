import { BillingService } from './billing.service';
import { InMemorySubscriptionRepository } from './in-memory-subscription.repository';
import { MockBillingProvider } from './mock-billing.provider';
import { InMemoryUserRepository } from '../auth/in-memory-user.repository';

describe('BillingService', () => {
  let subs: InMemorySubscriptionRepository;
  let users: InMemoryUserRepository;
  let service: BillingService;
  let userId: string;

  beforeEach(async () => {
    subs = new InMemorySubscriptionRepository();
    users = new InMemoryUserRepository();
    service = new BillingService(subs, users, new MockBillingProvider());
    const u = await users.create({
      email: 'u@example.com',
      passwordHash: null,
      displayName: 'U',
      providers: ['password'],
    });
    userId = u.id;
  });

  it('starts every user on Free with a 1-project quota', async () => {
    const view = await service.getView(userId);
    expect(view.plan).toBe('free');
    expect(view.projectQuota).toBe(1);
    expect(view.provider).toBe('mock');
    expect(await service.getProjectQuota(userId)).toBe(1);
  });

  it('upgrades to Pro (mock) → quota becomes 5', async () => {
    const res = await service.startCheckout(userId);
    expect(res.status).toBe('activated');

    const view = await service.getView(userId);
    expect(view.plan).toBe('pro');
    expect(view.projectQuota).toBe(5);
    expect(await service.getProjectQuota(userId)).toBe(5);
  });

  it('cancel (mock) keeps Pro until period end, then flips to Free', async () => {
    await service.startCheckout(userId);
    expect((await service.getView(userId)).plan).toBe('pro');

    // Cancel: still Pro (with the period-end flag) until the period lapses.
    const afterCancel = await service.cancel(userId);
    expect(afterCancel.plan).toBe('pro');
    expect(afterCancel.cancelAtPeriodEnd).toBe(true);
    expect(await service.getProjectQuota(userId)).toBe(5);

    // Fast-forward past the period end → effective plan drops to Free.
    const sub = await subs.findByUserId(userId);
    sub!.currentPeriodEnd = new Date(Date.now() - 1000);
    await subs.save(sub!);
    const view = await service.getView(userId);
    expect(view.plan).toBe('free');
    expect(view.projectQuota).toBe(1);
  });

  it('assertPro gates free users (402) and passes for Pro', async () => {
    expect(await service.isPro(userId)).toBe(false);
    await expect(service.assertPro(userId)).rejects.toMatchObject({
      response: { code: 'upgrade_required' },
    });

    await service.startCheckout(userId);
    expect(await service.isPro(userId)).toBe(true);
    await expect(service.assertPro(userId)).resolves.toBeUndefined();
  });
});
