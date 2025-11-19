import { useReducer, useCallback, useEffect, useRef } from "react";
import { sendMessage as sendChatMessage, generateSessionId, ChatApiError } from "../api/chatApi";
import type { Message, Role } from "../types/chat";

/**
 * Local storage key for persisting session ID
 */
const SESSION_ID_KEY = "cf_chat_session_id";

/**
 * State interface for the chat hook
 */
export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sessionId: string;
}

/**
 * Action types for the chat reducer
 */
type ChatAction =
  | { type: "SEND_MESSAGE_START"; payload: { message: Message } }
  | { type: "SEND_MESSAGE_STREAM"; payload: { messageId: string; chunk: string } }
  | { type: "SEND_MESSAGE_SUCCESS"; payload: { messageId: string } }
  | { type: "SEND_MESSAGE_ERROR"; payload: { messageId: string; error: string } }
  | { type: "CLEAR_CHAT" }
  | { type: "SET_SESSION_ID"; payload: { sessionId: string } }
  | { type: "SET_ERROR"; payload: { error: string | null } }
  | { type: "RETRY_MESSAGE_START"; payload: { messageId: string } };

/**
 * Initial state for the chat reducer
 */
const initialState: ChatState = {
  messages: [],
  isLoading: false,
  error: null,
  sessionId: "",
};

/**
 * Generate a unique message ID
 */
function createMessageId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Load session ID from localStorage or generate a new one
 */
function loadOrCreateSessionId(): string {
  if (typeof window === "undefined") {
    return generateSessionId();
  }

  try {
    const stored = localStorage.getItem(SESSION_ID_KEY);
    if (stored) {
      return stored;
    }
  } catch (error) {
    console.warn("Failed to read session ID from localStorage:", error);
  }

  const newSessionId = generateSessionId();
  try {
    localStorage.setItem(SESSION_ID_KEY, newSessionId);
  } catch (error) {
    console.warn("Failed to save session ID to localStorage:", error);
  }

  return newSessionId;
}

/**
 * Save session ID to localStorage
 */
function saveSessionId(sessionId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(SESSION_ID_KEY, sessionId);
  } catch (error) {
    console.warn("Failed to save session ID to localStorage:", error);
  }
}

/**
 * Chat reducer for managing complex state
 */
function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "SEND_MESSAGE_START": {
      return {
        ...state,
        isLoading: true,
        error: null,
        messages: [...state.messages, action.payload.message],
      };
    }

    case "SEND_MESSAGE_STREAM": {
      const { messageId, chunk } = action.payload;
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                content: chunk,
                pending: true,
              }
            : msg,
        ),
      };
    }

    case "SEND_MESSAGE_SUCCESS": {
      const { messageId } = action.payload;
      return {
        ...state,
        isLoading: false,
        messages: state.messages.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                pending: false,
              }
            : msg,
        ),
      };
    }

    case "SEND_MESSAGE_ERROR": {
      const { messageId, error } = action.payload;
      return {
        ...state,
        isLoading: false,
        error,
        messages: state.messages.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                content: `Error: ${error}`,
                pending: false,
              }
            : msg,
        ),
      };
    }

    case "CLEAR_CHAT": {
      const newSessionId = generateSessionId();
      saveSessionId(newSessionId);
      return {
        ...state,
        messages: [],
        isLoading: false,
        error: null,
        sessionId: newSessionId,
      };
    }

    case "SET_SESSION_ID": {
      const { sessionId } = action.payload;
      saveSessionId(sessionId);
      return {
        ...state,
        sessionId,
      };
    }

    case "SET_ERROR": {
      return {
        ...state,
        error: action.payload.error,
        isLoading: false,
      };
    }

    case "RETRY_MESSAGE_START": {
      const { messageId } = action.payload;
      return {
        ...state,
        isLoading: true,
        error: null,
        messages: state.messages.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                content: "",
                pending: true,
              }
            : msg,
        ),
      };
    }

    default:
      return state;
  }
}

/**
 * Return type for the useChat hook
 */
export interface UseChatReturn {
  /** Array of chat messages */
  messages: Message[];
  /** Whether a message is currently being sent */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Current session ID */
  sessionId: string;
  /** Send a message to the chat */
  sendMessage: (content: string) => Promise<void>;
  /** Clear the chat and start a new session */
  clearChat: () => void;
  /** Retry the last failed message */
  retryLastMessage: () => Promise<void>;
}

/**
 * Custom React hook for managing chat state and interactions
 *
 * Features:
 * - Manages messages, loading state, errors, and session ID
 * - Handles streaming responses from the API
 * - Persists session ID in localStorage
 * - Provides retry functionality for failed messages
 *
 * @example
 * ```typescript
 * const { messages, isLoading, error, sendMessage, clearChat } = useChat();
 *
 * // Send a message
 * await sendMessage("Hello!");
 *
 * // Clear chat
 * clearChat();
 * ```
 */
export function useChat(): UseChatReturn {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string | null>(null);

  // Initialize session ID from localStorage on mount
  useEffect(() => {
    const sessionId = loadOrCreateSessionId();
    dispatch({ type: "SET_SESSION_ID", payload: { sessionId } });
  }, []);

  // Cleanup: abort any ongoing requests on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  /**
   * Send a message to the chat API and handle streaming response
   */
  const sendMessage = useCallback(
    async (content: string): Promise<void> => {
      const trimmedContent = content.trim();
      if (!trimmedContent || state.isLoading) {
        return;
      }

      // Store the user message for potential retry
      lastUserMessageRef.current = trimmedContent;

      // Create user message
      const userMessage: Message = {
        id: createMessageId(),
        role: "user",
        content: trimmedContent,
        createdAt: Date.now(),
      };

      // Create assistant message placeholder
      const assistantMessage: Message = {
        id: createMessageId(),
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        pending: true,
      };

      // Dispatch start action
      dispatch({ type: "SEND_MESSAGE_START", payload: { message: userMessage } });
      dispatch({ type: "SEND_MESSAGE_START", payload: { message: assistantMessage } });

      // Abort any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        // Ensure we have a session ID
        const sessionId = state.sessionId || loadOrCreateSessionId();
        if (!state.sessionId && sessionId) {
          dispatch({ type: "SET_SESSION_ID", payload: { sessionId } });
        }

        // Send message and get streaming response
        const response = await sendChatMessage(trimmedContent, sessionId);

        // Check if request was aborted
        if (abortController.signal.aborted) {
          return;
        }

        // Accumulate chunks from the stream
        let accumulatedText = "";
        for await (const chunk of response) {
          // Check if request was aborted during streaming
          if (abortController.signal.aborted) {
            return;
          }

          accumulatedText += chunk;
          dispatch({
            type: "SEND_MESSAGE_STREAM",
            payload: {
              messageId: assistantMessage.id,
              chunk: accumulatedText,
            },
          });
        }

        // Mark message as complete
        if (!abortController.signal.aborted) {
          dispatch({
            type: "SEND_MESSAGE_SUCCESS",
            payload: { messageId: assistantMessage.id },
          });
        }
      } catch (error) {
        // Don't update state if request was aborted
        if (abortController.signal.aborted) {
          return;
        }

        const errorMessage =
          error instanceof ChatApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Failed to send message. Please try again.";

        dispatch({
          type: "SEND_MESSAGE_ERROR",
          payload: {
            messageId: assistantMessage.id,
            error: errorMessage,
          },
        });
      } finally {
        abortControllerRef.current = null;
      }
    },
    [state.isLoading, state.sessionId],
  );

  /**
   * Clear the chat and start a new session
   */
  const clearChat = useCallback(() => {
    // Abort any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    lastUserMessageRef.current = null;
    dispatch({ type: "CLEAR_CHAT" });
  }, []);

  /**
   * Retry the last user message
   */
  const retryLastMessage = useCallback(async (): Promise<void> => {
    if (!lastUserMessageRef.current || state.isLoading) {
      return;
    }

    // Find the last assistant message (which should be the failed one)
    const lastAssistantMessage = [...state.messages]
      .reverse()
      .find((msg) => msg.role === "assistant" && (msg.pending || msg.content.startsWith("Error:")));

    if (!lastAssistantMessage) {
      // No failed message to retry
      return;
    }

    // Reset the assistant message and retry
    dispatch({
      type: "RETRY_MESSAGE_START",
      payload: { messageId: lastAssistantMessage.id },
    });

    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const sessionId = state.sessionId || loadOrCreateSessionId();
      if (!state.sessionId && sessionId) {
        dispatch({ type: "SET_SESSION_ID", payload: { sessionId } });
      }

      const response = await sendChatMessage(lastUserMessageRef.current, sessionId);

      if (abortController.signal.aborted) {
        return;
      }

      let accumulatedText = "";
      for await (const chunk of response) {
        if (abortController.signal.aborted) {
          return;
        }

        accumulatedText += chunk;
        dispatch({
          type: "SEND_MESSAGE_STREAM",
          payload: {
            messageId: lastAssistantMessage.id,
            chunk: accumulatedText,
          },
        });
      }

      if (!abortController.signal.aborted) {
        dispatch({
          type: "SEND_MESSAGE_SUCCESS",
          payload: { messageId: lastAssistantMessage.id },
        });
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }

      const errorMessage =
        error instanceof ChatApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Failed to retry message. Please try again.";

      dispatch({
        type: "SEND_MESSAGE_ERROR",
        payload: {
          messageId: lastAssistantMessage.id,
          error: errorMessage,
        },
      });
    } finally {
      abortControllerRef.current = null;
    }
  }, [state.messages, state.isLoading, state.sessionId]);

  return {
    messages: state.messages,
    isLoading: state.isLoading,
    error: state.error,
    sessionId: state.sessionId,
    sendMessage,
    clearChat,
    retryLastMessage,
  };
}

