import { Injectable } from '@nestjs/common';
import type { ChatMessage, ChatRole } from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ChatMessageRepository,
  CreateChatMessageInput,
} from './chat-message.repository';

/** PostgreSQL-backed chat-message store. */
@Injectable()
export class PrismaChatMessageRepository implements ChatMessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateChatMessageInput): Promise<ChatMessage> {
    const row = await this.prisma.chatMessage.create({
      data: {
        sessionId: input.sessionId,
        role: input.role,
        content: input.content,
      },
    });
    return toEntity(row);
  }

  async listBySession(sessionId: string): Promise<ChatMessage[]> {
    const rows = await this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toEntity);
  }
}

function toEntity(row: {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  createdAt: Date;
}): ChatMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    role: row.role as ChatRole,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}
