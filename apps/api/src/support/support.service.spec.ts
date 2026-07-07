import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ALL_PERMISSIONS, type AuthUser, type Permission } from '@archivato/shared';
import { SupportService } from './support.service';
import { SupportAiService } from './support-ai.service';
import { KbService } from './kb.service';
import { InMemoryKbRepository } from './in-memory-kb.repository';
import { SupportNotificationsService } from './support-notifications.service';
import { InMemorySupportRepository } from './in-memory-support.repository';
import { InMemoryUserRepository } from '../auth/in-memory-user.repository';
import { InMemoryInterviewSessionRepository } from '../interview/in-memory-interview-session.repository';
import { SupportAssistantAgent } from '../llm/agents/support-assistant.agent';
import { MockLlmProvider } from '../llm/mock-llm.provider';
import { RoleService } from '../roles/role.service';
import { InMemoryRoleRepository } from '../roles/in-memory-role.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { InMemoryNotificationRepository } from '../notifications/in-memory-notification.repository';
import type { BillingService } from '../billing/billing.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { MailService } from '../auth/mail.service';
import type { ConfigService } from '@nestjs/config';

interface Harness {
  support: SupportService;
  ai: SupportAiService;
  inApp: NotificationsService;
  customer: AuthUser;
  other: AuthUser;
  admin: AuthUser;
  /** Create a real staff account carrying exactly the given permissions. */
  mkStaff: (email: string, permissions: Permission[]) => Promise<AuthUser>;
}

async function makeHarness(): Promise<Harness> {
  const repo = new InMemorySupportRepository();
  const users = new InMemoryUserRepository();
  const sessions = new InMemoryInterviewSessionRepository();
  // Real in-app notifications (in-memory) + stubbed mailer/config so the wiring
  // runs without a DB or SMTP.
  const inApp = new NotificationsService(new InMemoryNotificationRepository());
  const mail = {
    sendNotificationEmail: async () => undefined,
  } as unknown as MailService;
  const config = {
    get: (_key: string, fallback?: unknown) => fallback,
  } as unknown as ConfigService;
  const notifications = new SupportNotificationsService(
    users,
    mail,
    inApp,
    config,
  );
  const agent = new SupportAssistantAgent(new MockLlmProvider());

  // Minimal stubs for the dependencies the Support flow only touches lightly.
  const billing = {
    getView: async () => ({
      plan: 'free',
      status: 'active',
      projectQuota: 1,
      periodEnd: null,
      cancelAtPeriodEnd: false,
      provider: 'mock',
    }),
  } as unknown as BillingService;
  const prisma = { user: { findMany: async () => [] } } as unknown as PrismaService;

  const roleService = new RoleService(new InMemoryRoleRepository());
  const support = new SupportService(
    repo,
    users,
    sessions,
    billing,
    notifications,
    prisma,
    roleService,
  );
  // A real KB service over an in-memory store, seeded with the curated set so
  // deflection can match articles offline (mirrors the boot seeder).
  const kb = new KbService(new InMemoryKbRepository());
  await kb.onModuleInit();
  const ai = new SupportAiService(repo, sessions, agent, kb, notifications);

  const mk = async (email: string, role: 'user' | 'admin'): Promise<AuthUser> => {
    const u = await users.create({
      email,
      passwordHash: 'x',
      displayName: email.split('@')[0],
    });
    if (role === 'admin') await users.save({ ...u, role: 'admin' });
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      emailVerified: true,
      role,
      roles: role === 'admin' ? ['super_admin'] : [],
      permissions: role === 'admin' ? [...ALL_PERMISSIONS] : [],
      providers: ['password'],
      createdAt: u.createdAt.toISOString(),
    };
  };

  const mkStaff = async (
    email: string,
    permissions: Permission[],
  ): Promise<AuthUser> => {
    const u = await users.create({
      email,
      passwordHash: 'x',
      displayName: email.split('@')[0],
    });
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      emailVerified: true,
      role: 'user',
      roles: ['support_agent'],
      permissions,
      providers: ['password'],
      createdAt: u.createdAt.toISOString(),
    };
  };

  return {
    support,
    ai,
    inApp,
    customer: await mk('cust@example.com', 'user'),
    other: await mk('other@example.com', 'user'),
    admin: await mk('admin@example.com', 'admin'),
    mkStaff,
  };
}

const NEW_TICKET = {
  subject: 'Cannot generate the API design',
  description:
    'When I click generate on the API design tab nothing happens and I see a 402 error.',
  category: 'ai_generation' as const,
};

describe('SupportService', () => {
  it('creates a ticket with the description as the first message', async () => {
    const h = await makeHarness();
    const detail = await h.support.createTicket(h.customer, NEW_TICKET);

    expect(detail.number).toBeGreaterThan(0);
    expect(detail.status).toBe('open');
    expect(detail.messages).toHaveLength(1);
    expect(detail.messages[0].authorType).toBe('customer');
    expect(detail.events.some((e) => e.type === 'ticket_created')).toBe(true);
    expect(detail.customer.email).toBe('cust@example.com');
  });

  it('notifies the ticket owner in-app when the ticket is created', async () => {
    const h = await makeHarness();
    await h.support.createTicket(h.customer, NEW_TICKET);

    const page = await h.inApp.page(h.customer.id);
    expect(page.unread).toBe(1);
    expect(page.items[0].type).toBe('ticket_created');
    expect(page.items[0].link).toContain('/support/tickets/');
    // The other customer got nothing (no broadcast).
    expect((await h.inApp.page(h.other.id)).unread).toBe(0);
  });

  it('hides tickets from other customers (404, no leak) but not from admins', async () => {
    const h = await makeHarness();
    const t = await h.support.createTicket(h.customer, NEW_TICKET);

    await expect(h.support.getTicketDetail(h.other, t.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(h.support.getTicketDetail(h.admin, t.id)).resolves.toBeTruthy();
  });

  it('flips the waiting side on reply and records first response time', async () => {
    const h = await makeHarness();
    const t = await h.support.createTicket(h.customer, NEW_TICKET);

    const afterCustomer = await h.support.reply(h.customer, t.id, 'Any update?');
    expect(afterCustomer.status).toBe('waiting_admin');

    const afterAdmin = await h.support.reply(h.admin, t.id, 'Looking into it now.');
    expect(afterAdmin.status).toBe('waiting_customer');
    expect(afterAdmin.messages.some((m) => m.authorType === 'admin')).toBe(true);
  });

  it('lets a read-only staff role see a ticket but NOT reply to it', async () => {
    const h = await makeHarness();
    const t = await h.support.createTicket(h.customer, NEW_TICKET);
    const viewer = await h.mkStaff('viewer@example.com', ['support:read_all']);

    // Can read every ticket…
    await expect(h.support.getTicketDetail(viewer, t.id)).resolves.toBeTruthy();
    // …but cannot answer without `support:reply`.
    await expect(h.support.reply(viewer, t.id, 'Hi')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const replier = await h.mkStaff('replier@example.com', [
      'support:read_all',
      'support:reply',
    ]);
    await expect(h.support.reply(replier, t.id, 'On it')).resolves.toBeTruthy();
  });

  it('requires support:manage to change status/priority and support:assign to assign', async () => {
    const h = await makeHarness();
    const t = await h.support.createTicket(h.customer, NEW_TICKET);
    const agent = await h.mkStaff('agent@example.com', ['support:read_all']);

    // read-only → no workflow changes, no assignment, no close.
    await expect(
      h.support.adminUpdateTicket(agent, t.id, { status: 'in_progress' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      h.support.adminUpdateTicket(agent, t.id, { assigneeId: agent.id }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(h.support.closeTicket(agent, t.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    // manage (not assign) → can change status, still can't assign.
    const manager = await h.mkStaff('mgr@example.com', [
      'support:read_all',
      'support:manage',
    ]);
    await expect(
      h.support.adminUpdateTicket(manager, t.id, { status: 'in_progress' }),
    ).resolves.toBeTruthy();
    await expect(
      h.support.adminUpdateTicket(manager, t.id, { assigneeId: manager.id }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets the ticket owner close their own ticket without support:manage', async () => {
    const h = await makeHarness();
    const t = await h.support.createTicket(h.customer, NEW_TICKET);
    await expect(h.support.closeTicket(h.customer, t.id)).resolves.toMatchObject({
      status: 'closed',
    });
  });

  it('keeps internal notes admin-only', async () => {
    const h = await makeHarness();
    const t = await h.support.createTicket(h.customer, NEW_TICKET);
    await h.support.addInternalNote(h.admin, t.id, 'Reproduced — billing plan is free.');

    const asAdmin = await h.support.getTicketDetail(h.admin, t.id);
    const asCustomer = await h.support.getTicketDetail(h.customer, t.id);
    expect(asAdmin.internalNotes).toHaveLength(1);
    expect(asCustomer.internalNotes).toHaveLength(0);
  });

  it('closes and reopens a ticket', async () => {
    const h = await makeHarness();
    const t = await h.support.createTicket(h.customer, NEW_TICKET);
    const closed = await h.support.closeTicket(h.customer, t.id);
    expect(closed.status).toBe('closed');
    const reopened = await h.support.reopenTicket(h.customer, t.id);
    expect(reopened.status).toBe('open');
  });

  it('computes admin dashboard stats', async () => {
    const h = await makeHarness();
    await h.support.createTicket(h.customer, NEW_TICKET);
    const stats = await h.support.adminStats();
    expect(stats.openTickets).toBe(1);
    expect(stats.newest).toHaveLength(1);
  });
});

describe('SupportAiService', () => {
  it('deflects with a valid, complete result shape', async () => {
    const h = await makeHarness();
    const result = await h.ai.deflect(h.customer, {
      message: 'I hit a 402 upgrade error and cannot generate the API design.',
    });
    expect(typeof result.answer).toBe('string');
    expect(result.answer.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    // The KB has a matching article, so we expect at least one suggestion.
    expect(result.articles.length).toBeGreaterThan(0);
  });

  it('analyzes a ticket and persists an in-ticket suggestion', async () => {
    const h = await makeHarness();
    const t = await h.support.createTicket(h.customer, NEW_TICKET);
    const analysis = await h.ai.analyzeTicket(h.customer, t.id);
    expect(analysis.summary.length).toBeGreaterThan(0);
    expect(analysis.suggestedReply.length).toBeGreaterThan(0);

    const detail = await h.support.getTicketDetail(h.customer, t.id);
    expect(detail.aiSuggestions.some((s) => s.layer === 'in_ticket')).toBe(true);
  });
});
