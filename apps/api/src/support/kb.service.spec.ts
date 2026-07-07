import { NotFoundException } from '@nestjs/common';
import { KbService } from './kb.service';
import { InMemoryKbRepository } from './in-memory-kb.repository';
import { KB_SEED } from './support-knowledge-base';

async function makeService(): Promise<KbService> {
  const svc = new KbService(new InMemoryKbRepository());
  await svc.onModuleInit();
  return svc;
}

describe('KbService', () => {
  it('seeds the curated set on first boot, idempotently', async () => {
    const repo = new InMemoryKbRepository();
    const svc = new KbService(repo);
    await svc.onModuleInit();
    expect(await repo.count()).toBe(KB_SEED.length);
    // Re-running does not duplicate (store is non-empty).
    await svc.onModuleInit();
    expect(await repo.count()).toBe(KB_SEED.length);
  });

  it('ranks published articles by query for the public list + deflection', async () => {
    const svc = await makeService();
    const results = await svc.listPublic('how do I enable real groq ai');
    expect(results[0].title).toMatch(/Groq/i);

    const deflect = await svc.searchForDeflection('reset my password', 3);
    expect(deflect.length).toBeGreaterThan(0);
    expect(deflect[0].title).toMatch(/password/i);
    expect(deflect[0].excerpt.length).toBeGreaterThan(0);
  });

  it('hides drafts from the public list, detail, and deflection', async () => {
    const svc = await makeService();
    const draft = await svc.create({
      title: 'Secret internal runbook',
      body: 'Internal-only troubleshooting for the payments outage incident.',
      category: 'billing',
      keywords: ['payments', 'outage', 'incident', 'runbook'],
      published: false,
    });

    // Not in the public list…
    const publicList = await svc.listPublic();
    expect(publicList.some((a) => a.id === draft.id)).toBe(false);

    // …not fetchable publicly…
    await expect(svc.getPublic(draft.id)).rejects.toBeInstanceOf(NotFoundException);

    // …and never surfaced by deflection, even on a direct keyword hit.
    const deflect = await svc.searchForDeflection('payments outage incident', 5);
    expect(deflect.some((a) => a.id === draft.id)).toBe(false);

    // But visible to staff (admin list includes drafts).
    const adminList = await svc.adminList();
    const row = adminList.find((a) => a.id === draft.id);
    expect(row?.published).toBe(false);
  });

  it('supports full CRUD and returns published detail with a body', async () => {
    const svc = await makeService();
    const created = await svc.create({
      title: 'Rotate your API token',
      body: 'Go to settings and click rotate. The old token is revoked immediately.',
      category: 'account',
      keywords: ['token', 'rotate', 'api'],
      published: true,
    });

    const detail = await svc.getPublic(created.id);
    expect(detail.body).toContain('rotate');
    expect(detail.excerpt.length).toBeGreaterThan(0);

    await svc.update(created.id, { title: 'Rotate your API key' });
    expect((await svc.adminGet(created.id)).title).toBe('Rotate your API key');

    await svc.remove(created.id);
    await expect(svc.adminGet(created.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s updating or deleting a missing article', async () => {
    const svc = await makeService();
    await expect(svc.update('nope', { title: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
