import type { ChatMessage, ChatRole } from '@archivato/shared';

/** DI token for the chat-message store. */
export const CHAT_MESSAGE_REPOSITORY = Symbol('CHAT_MESSAGE_REPOSITORY');

export interface CreateChatMessageInput {
  sessionId: string;
  role: ChatRole;
  content: string;
}

/** Persistence seam for refinement chat messages (Repository pattern). */
export interface ChatMessageRepository {
  create(input: CreateChatMessageInput): Promise<ChatMessage>;
  /** All messages for a session, oldest first. */
  listBySession(sessionId: string): Promise<ChatMessage[]>;
}
