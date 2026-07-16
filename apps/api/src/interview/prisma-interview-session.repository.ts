import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  FixLogEntry,
  InterviewExchange,
  InterviewQuestion,
  InterviewStatus,
  IntentAnalysis,
  OpenQuestion,
  ProposalDraft,
  RequirementsSummary,
  SlotMap,
} from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { InterviewSession } from './interview-session.entity';
import type { InterviewSessionRepository } from './interview-session.repository';

/** PostgreSQL-backed session store. */
@Injectable()
export class PrismaInterviewSessionRepository
  implements InterviewSessionRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(session: InterviewSession): Promise<InterviewSession> {
    const row = await this.prisma.interviewSession.create({
      data: {
        id: session.id,
        userId: session.userId,
        idea: session.input.idea,
        title: session.title ?? null,
        clientName: session.clientName ?? null,
        weeklyRate: session.weeklyRate ?? null,
        industry: session.input.industry ?? null,
        scale: session.input.scale ?? null,
        preferredStack: session.input.preferredStack ?? null,
        status: session.status,
        intent: toJson(session.intent),
        history: toJsonArray(session.history),
        pendingQuestion: toJson(session.pendingQuestion),
        coverage: session.coverage,
        summary: toJson(session.summary),
        slots: toJson(session.slots),
        openQuestions: toJson(session.openQuestions),
        fixLog: toJson(session.fixLog),
        proposalDrafts: toJson(session.proposalDrafts),
        generateExtendedArtifacts: session.generateExtendedArtifacts,
      },
    });
    return toEntity(row);
  }

  async findById(id: string): Promise<InterviewSession | null> {
    const row = await this.prisma.interviewSession.findUnique({ where: { id } });
    return row ? toEntity(row) : null;
  }

  async findByUserId(userId: string): Promise<InterviewSession[]> {
    const rows = await this.prisma.interviewSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(toEntity);
  }

  countByUserId(userId: string): Promise<number> {
    return this.prisma.interviewSession.count({ where: { userId } });
  }

  countByUserIdCreatedSince(userId: string, since: Date): Promise<number> {
    return this.prisma.interviewSession.count({
      where: { userId, createdAt: { gte: since } },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.interviewSession.delete({ where: { id } });
  }

  async save(session: InterviewSession): Promise<InterviewSession> {
    const row = await this.prisma.interviewSession.update({
      where: { id: session.id },
      data: {
        title: session.title ?? null,
        clientName: session.clientName ?? null,
        weeklyRate: session.weeklyRate ?? null,
        status: session.status,
        intent: toJson(session.intent),
        history: toJsonArray(session.history),
        pendingQuestion: toJson(session.pendingQuestion),
        coverage: session.coverage,
        summary: toJson(session.summary),
        slots: toJson(session.slots),
        openQuestions: toJson(session.openQuestions),
        fixLog: toJson(session.fixLog),
        proposalDrafts: toJson(session.proposalDrafts),
        generateExtendedArtifacts: session.generateExtendedArtifacts,
      },
    });
    return toEntity(row);
  }
}

/** A null-or-object value for a nullable Json column. */
function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value == null
    ? Prisma.JsonNull
    : (value as Prisma.InputJsonValue);
}

function toJsonArray(value: unknown[]): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** Map a DB row back to the domain entity. */
function toEntity(row: {
  id: string;
  userId: string | null;
  idea: string;
  title: string | null;
  clientName: string | null;
  weeklyRate: number | null;
  industry: string | null;
  scale: string | null;
  preferredStack: string | null;
  status: string;
  intent: Prisma.JsonValue;
  history: Prisma.JsonValue;
  pendingQuestion: Prisma.JsonValue;
  coverage: number;
  summary: Prisma.JsonValue;
  slots: Prisma.JsonValue;
  openQuestions: Prisma.JsonValue;
  fixLog: Prisma.JsonValue;
  proposalDrafts: Prisma.JsonValue;
  generateExtendedArtifacts: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}): InterviewSession {
  return {
    id: row.id,
    userId: row.userId ?? null,
    title: row.title ?? null,
    clientName: row.clientName ?? null,
    weeklyRate: row.weeklyRate ?? null,
    input: {
      idea: row.idea,
      industry: row.industry ?? undefined,
      scale: (row.scale as InterviewSession['input']['scale']) ?? undefined,
      preferredStack: row.preferredStack ?? undefined,
    },
    status: row.status as InterviewStatus,
    intent: (row.intent as IntentAnalysis | null) ?? null,
    history: (row.history as unknown as InterviewExchange[]) ?? [],
    pendingQuestion:
      (row.pendingQuestion as unknown as InterviewQuestion | null) ?? null,
    coverage: row.coverage ?? 0,
    summary: (row.summary as RequirementsSummary | null) ?? null,
    slots: (row.slots as SlotMap | null) ?? null,
    openQuestions: (row.openQuestions as unknown as OpenQuestion[] | null) ?? null,
    fixLog: (row.fixLog as unknown as FixLogEntry[] | null) ?? null,
    proposalDrafts:
      (row.proposalDrafts as unknown as ProposalDraft[] | null) ?? null,
    // Null is meaningful here (= not decided), so it must NOT be coerced — read it
    // through `resolveExtendedArtifacts`, which applies the budget-derived default.
    generateExtendedArtifacts: row.generateExtendedArtifacts,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
