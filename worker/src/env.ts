export interface Env {
  AI: Ai;
  CHAT_SESSIONS: DurableObjectNamespace;
  /**
   * Optional override for the default Workers AI model ID.
   */
  DEFAULT_MODEL?: string;
}

export type ChatRole = "user" | "assistant";

export interface ChatHistoryEntry {
  role: ChatRole;
  content: string;
}

