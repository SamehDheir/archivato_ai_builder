import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { ChatMessage } from '@archivato/shared';
import type {
  ChatMessageRepository,
  CreateChatMessageInput,
} from './chat-message.repository';

/** In-memory chat-message store — used by unit tests. */
@Injectable()
export class InMemoryChatMessageRepository implements ChatMessageRepository {
  private readonly messages: ChatMessage[] = [];

  async create(input: CreateChatMessageInput): Promise<ChatMessage> {
    const message: ChatMessage = {
      id: randomUUID(),
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      createdAt: new Date().toISOString(),
    };
    this.messages.push(message);
    return { ...message };
  }

  async listBySession(sessionId: string): Promise<ChatMessage[]> {
    return this.messages
      .filter((m) => m.sessionId === sessionId)
      .map((m) => ({ ...m }));
  }
}
