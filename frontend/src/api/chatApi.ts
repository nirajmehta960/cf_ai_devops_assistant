import { v4 as uuidv4 } from "uuid";

/**
 * Configuration options for the chat API client
 */
export interface ChatApiConfig {
  /** Base URL of the Worker endpoint */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Delay between retries in milliseconds (default: 1000) */
  retryDelay?: number;
  /** Whether to retry on network errors (default: true) */
  retryOnNetworkError?: boolean;
  /** HTTP status codes that should trigger a retry (default: [500, 502, 503, 504]) */
  retryableStatusCodes?: number[];
}

/**
 * Request payload for sending a chat message
 */
export interface ChatRequest {
  message: string;
  sessionId: string;
}

/**
 * Response from the chat API (streaming)
 */
export type ChatResponse = AsyncGenerator<string, void, unknown>;

/**
 * Error thrown by the chat API
 */
export class ChatApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = "ChatApiError";
  }
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<Omit<ChatApiConfig, "baseUrl">> = {
  timeout: 60000, // 60 seconds
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  retryOnNetworkError: true,
  retryableStatusCodes: [500, 502, 503, 504],
};

/**
 * Get the base URL from environment or default
 */
function getBaseUrl(): string {
  return (
    (import.meta.env.VITE_WORKER_BASE_URL as string | undefined)?.replace(/\/$/, "") ??
    "http://127.0.0.1:8787"
  );
}

/**
 * Generate a unique session ID using UUID
 */
export function generateSessionId(): string {
  return uuidv4();
}

/**
 * Check if an error is retryable
 */
function isRetryableError(
  error: unknown,
  statusCode?: number,
  retryableStatusCodes: number[] = DEFAULT_CONFIG.retryableStatusCodes,
  retryOnNetworkError: boolean = DEFAULT_CONFIG.retryOnNetworkError,
): boolean {
  // Check if status code is retryable
  if (statusCode && retryableStatusCodes.includes(statusCode)) {
    return true;
  }

  // Check if it's a network error and retry is enabled
  if (retryOnNetworkError) {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      return true;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      return false; // Don't retry aborted requests
    }
  }

  return false;
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create an AbortController with timeout
 */
function createTimeoutController(timeout: number): AbortController {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeout);
  return controller;
}

/**
 * Parse streaming response and yield text chunks
 * Yields incremental chunks as they arrive from the stream
 */
async function* parseStream(
  response: Response,
  signal: AbortSignal,
): AsyncGenerator<string, void, unknown> {
  if (!response.body) {
    throw new ChatApiError("Response body is null", response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      if (signal.aborted) {
        throw new ChatApiError("Request aborted", undefined, new DOMException("Aborted", "AbortError"));
      }

      const { done, value } = await reader.read();

      if (done) {
        // Decode any remaining buffered content
        const finalChunk = decoder.decode();
        if (finalChunk) {
          yield finalChunk;
        }
        break;
      }

      if (value) {
        // Decode the chunk (stream: true means more data may come)
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          yield chunk;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Send a chat message to the Worker endpoint with streaming response
 *
 * @param message - The message to send
 * @param sessionId - The session ID (use generateSessionId() to create one)
 * @param config - Optional configuration overrides
 * @returns An async generator that yields text chunks from the streaming response
 *
 * @example
 * ```typescript
 * const sessionId = generateSessionId();
 * const response = await sendMessage("Hello, how can you help?", sessionId);
 *
 * // Stream response chunks and accumulate
 * let fullText = "";
 * for await (const chunk of response) {
 *   fullText += chunk;
 *   // Update UI with accumulated text
 *   updateMessage(fullText);
 * }
 * ```
 */
export async function sendMessage(
  message: string,
  sessionId: string,
  config: ChatApiConfig = {},
): Promise<ChatResponse> {
  const baseUrl = config.baseUrl ?? getBaseUrl();
  const timeout = config.timeout ?? DEFAULT_CONFIG.timeout;
  const maxRetries = config.maxRetries ?? DEFAULT_CONFIG.maxRetries;
  const retryDelay = config.retryDelay ?? DEFAULT_CONFIG.retryDelay;
  const retryableStatusCodes = config.retryableStatusCodes ?? DEFAULT_CONFIG.retryableStatusCodes;
  const retryOnNetworkError = config.retryOnNetworkError ?? DEFAULT_CONFIG.retryOnNetworkError;

  const requestBody: ChatRequest = {
    message: message.trim(),
    sessionId: sessionId.trim(),
  };

  if (!requestBody.message) {
    throw new ChatApiError("Message cannot be empty");
  }

  if (!requestBody.sessionId) {
    throw new ChatApiError("Session ID cannot be empty");
  }

  let lastError: Error | undefined;
  let lastStatusCode: number | undefined;

  // Retry loop
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const timeoutController = createTimeoutController(timeout);
    const abortSignal = timeoutController.signal;

    try {
      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: abortSignal,
      });

      // Handle non-OK responses
      if (!response.ok) {
        lastStatusCode = response.status;

        // Try to parse error message from response
        let errorMessage = `Request failed with status ${response.status}`;
        try {
          const errorData = await response.json();
          if (typeof errorData === "object" && errorData !== null) {
            if ("error" in errorData && typeof errorData.error === "string") {
              errorMessage = errorData.error;
            }
          }
        } catch {
          // If JSON parsing fails, use default error message
        }

        // Check if we should retry
        if (
          attempt < maxRetries &&
          isRetryableError(undefined, response.status, retryableStatusCodes, retryOnNetworkError)
        ) {
          await sleep(retryDelay * (attempt + 1)); // Exponential backoff
          continue;
        }

        throw new ChatApiError(errorMessage, response.status);
      }

      // Success - return streaming generator
      return parseStream(response, abortSignal);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if it's an AbortError (timeout or manual abort)
      if (lastError instanceof DOMException && lastError.name === "AbortError") {
        if (timeoutController.signal.aborted) {
          throw new ChatApiError(`Request timeout after ${timeout}ms`, undefined, lastError);
        }
        throw new ChatApiError("Request was aborted", undefined, lastError);
      }

      // Check if we should retry
      if (
        attempt < maxRetries &&
        isRetryableError(lastError, lastStatusCode, retryableStatusCodes, retryOnNetworkError)
      ) {
        await sleep(retryDelay * (attempt + 1)); // Exponential backoff
        continue;
      }

      // If it's already a ChatApiError, rethrow it
      if (error instanceof ChatApiError) {
        throw error;
      }

      // Wrap other errors
      throw new ChatApiError(
        lastError.message || "Unknown error occurred",
        lastStatusCode,
        lastError,
      );
    }
  }

  // This should never be reached, but TypeScript needs it
  throw new ChatApiError(
    `Request failed after ${maxRetries + 1} attempts`,
    lastStatusCode,
    lastError,
  );
}

