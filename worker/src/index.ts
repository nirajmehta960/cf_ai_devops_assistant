import type { Env } from "./env";
export { ChatSession } from "./durable-objects/ChatSession";

interface ChatRequestBody {
  message?: string;
  sessionId?: string;
}

interface DurableObjectPayload {
  message: string;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return withCors(
        jsonResponse({
          ok: true,
          timestamp: new Date().toISOString(),
        }),
      );
    }

    if (request.method === "POST" && url.pathname === "/chat") {
      return handleChatRequest(request, env);
    }

    return withCors(jsonResponse({ error: "Not found" }, { status: 404 }));
  },
};

async function handleChatRequest(request: Request, env: Env): Promise<Response> {
  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return withCors(jsonResponse({ error: "Invalid JSON body." }, { status: 400 }));
  }

  const message = body.message?.trim();
  const sessionId = body.sessionId?.trim();

  if (!message) {
    return withCors(jsonResponse({ error: "`message` is required." }, { status: 400 }));
  }

  if (!sessionId) {
    return withCors(jsonResponse({ error: "`sessionId` is required." }, { status: 400 }));
  }

  try {
    const id = env.CHAT_SESSIONS.idFromName(sessionId);
    const stub = env.CHAT_SESSIONS.get(id);
    const durableRequest = new Request("https://chat-session.internal/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message } satisfies DurableObjectPayload),
    });

    const response = await stub.fetch(durableRequest);
    if (!response.ok) {
      const resultText = await response.text();
      const parsed = safeJsonParse(resultText);
      const errorMessage = getErrorMessage(parsed);
      return withCors(
        jsonResponse(
          {
            error: errorMessage ?? "Durable Object error",
            details: errorMessage ? undefined : resultText,
          },
          { status: response.status },
        ),
      );
    }

    const proxied = new Response(response.body, response);
    return withCors(proxied);
  } catch (error) {
    console.error("Failed to handle /chat request", error);
    return withCors(
      jsonResponse(
        {
          error: "Unable to process chat request.",
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      ),
    );
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(payload: unknown): string | undefined {
  if (isRecord(payload) && typeof payload.error === "string") {
    return payload.error;
  }
  return undefined;
}

function withCors(response: Response): Response {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers,
  });
}

