/**
 * Chat Message Types
 */

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  toolCalls?: any[];
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: any[];
}
