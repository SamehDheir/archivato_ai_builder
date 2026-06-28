import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  InterviewExchange,
  InterviewStatus,
  IntentAnalysis,
  RequirementsSummary,
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
        idea: session.input.idea,
        industry: session.input.industry ?? null,
        scale: session.input.scale ?? null,
        preferredStack: session.input.preferredStack ?? null,
        status: session.status,
        intent: toJson(session.intent),
        history: toJsonArray(session.history),
        summary: toJson(session.summary),
      },
    });
    return toEntity(row);
  }

  async findById(id: string): Promise<InterviewSession | null> {
    const row = await this.prisma.interviewSession.findUnique({ where: { id } });
    return row ? toEntity(row) : null;
  }

  async save(session: InterviewSession): Promise<InterviewSession> {
    const row = await this.prisma.interviewSession.update({
      where: { id: session.id },
      data: {
        status: session.status,
        intent: toJson(session.intent),
        history: toJsonArray(session.history),
        summary: toJson(session.summary),
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
  idea: string;
  industry: string | null;
  scale: string | null;
  preferredStack: string | null;
  status: string;
  intent: Prisma.JsonValue;
  history: Prisma.JsonValue;
  summary: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): InterviewSession {
  return {
    id: row.id,
    input: {
      idea: row.idea,
      industry: row.industry ?? undefined,
      scale: (row.scale as InterviewSession['input']['scale']) ?? undefined,
      preferredStack: row.preferredStack ?? undefined,
    },
    status: row.status as InterviewStatus,
    intent: (row.intent as IntentAnalysis | null) ?? null,
    history: (row.history as unknown as InterviewExchange[]) ?? [],
    summary: (row.summary as RequirementsSummary | null) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
