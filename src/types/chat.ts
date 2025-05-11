// src/types/chat.ts
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
  }
  
  export interface ChatState {
    messages: ChatMessage[];
    isLoading: boolean;
    error: string | null;
  }