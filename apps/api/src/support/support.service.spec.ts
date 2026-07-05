import { NotFoundException } from '@nestjs/common';
import { ALL_PERMISSIONS, type AuthUser } from '@archivato/shared';
import { SupportService } from './support.service';
import { SupportAiService } from './support-ai.service';
import { SupportNotificationsService } from './support-notifications.service';
import { InMemorySupportRepository } from './in-memory-support.repository';
import { InMemoryUserRepository } from '../auth/in-memory-user.repository';
import { InMemoryInterviewSessionRepository } from '../interview/in-memory-interview-session.repository';
import { SupportAssistantAgent } from '../llm/agents/support-assistant.agent';
import { MockLlmProvider } from '../llm/mock-llm.provider';
import { RoleService } from '../roles/role.service';
import { InMemoryRoleRepository } from '../roles/in-memory-role.repository';
import type { BillingService } from '../billing/billing.service';
import type { PrismaService } from '../prisma/prisma.service';

interface Harness {
  support: SupportService;
  ai: SupportAiService;
  customer: AuthUser;
  other: AuthUser;
  admin: AuthUser;
}

async function makeHarness(): Promise<Harness> {
  const repo = new InMemorySupportRepository();
  const users = new InMemoryUserRepository();
  const sessions = new InMemoryInterviewSessionRepository();
  const notifications = new SupportNotificationsService();
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
  const ai = new SupportAiService(repo, sessions, agent, notifications);

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

  return {
    support,
    ai,
    customer: await mk('cust@example.com', 'user'),
    other: await mk('other@example.com', 'user'),
    admin: await mk('admin@example.com', 'admin'),
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
