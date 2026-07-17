import { NotificationsService } from './notifications.service';
import { InMemoryNotificationRepository } from './in-memory-notification.repository';

describe('NotificationsService', () => {
  let repo: InMemoryNotificationRepository;
  let service: NotificationsService;

  beforeEach(() => {
    repo = new InMemoryNotificationRepository();
    service = new NotificationsService(repo);
  });

  const make = (userId: string, title: string) =>
    service.notify({
      userId,
      type: 'ticket_created',
      title,
      body: 'body',
      // Mirrors a real link (`/support/:id` — the web app's actual ticket route).
      link: '/support/1',
    });

  it('creates notifications and reports the unread count', async () => {
    await make('u1', 'A');
    await make('u1', 'B');

    const page = await service.page('u1');
    expect(page.unread).toBe(2);
    expect(page.items.map((i) => i.title)).toEqual(['B', 'A']); // newest first
    expect(page.items[0].read).toBe(false);
  });

  it('scopes notifications to their owner', async () => {
    await make('u1', 'A');
    await make('u2', 'B');

    expect((await service.page('u1')).unread).toBe(1);
    expect((await service.page('u2')).unread).toBe(1);
    expect((await service.page('u1')).items[0].title).toBe('A');
  });

  it('marks a single notification read', async () => {
    await make('u1', 'A');
    await make('u1', 'B');
    const { items } = await service.page('u1');

    await service.markRead('u1', items[0].id);
    expect((await service.page('u1')).unread).toBe(1);
  });

  it("can't mark another user's notification read", async () => {
    await make('u1', 'A');
    const { items } = await service.page('u1');

    await service.markRead('u2', items[0].id); // wrong owner → no-op
    expect((await service.page('u1')).unread).toBe(1);
  });

  it('marks all read', async () => {
    await make('u1', 'A');
    await make('u1', 'B');

    await service.markAllRead('u1');
    const page = await service.page('u1');
    expect(page.unread).toBe(0);
    expect(page.items.every((i) => i.read)).toBe(true);
  });

  it('notify never throws even if the repository fails', async () => {
    const failing = {
      create: async () => {
        throw new Error('db down');
      },
    } as unknown as InMemoryNotificationRepository;
    const svc = new NotificationsService(failing);
    await expect(
      svc.notify({ userId: 'u1', type: 'ticket_created', title: 'x', body: 'y' }),
    ).resolves.toBeUndefined();
  });
});
