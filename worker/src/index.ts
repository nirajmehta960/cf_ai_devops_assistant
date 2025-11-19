const DEFAULT_MODEL_FALLBACK = "@cf/meta/llama-3.1-8b-instruct";
const DEFAULT_SYSTEM_PROMPT =
  "You are an AI DevOps assistant that helps teams ship Cloudflare Workers and front-end apps. Provide concise, actionable answers.";

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

interface ChatRequestBody {
  messages?: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  system?: string;
}

interface Env {
  AI: Ai;
  /**
   * Optional defaults configured in `wrangler.toml`
   */
  DEFAULT_MODEL?: string;
  SYSTEM_PROMPT?: string;
}

type AiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: Array<{ type: "text"; text: string }>;
};

type DialogueTurn = {
  role: "user" | "assistant";
  content: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return makeCorsResponse(null, { status: 204 });
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return makeCorsJson({ ok: true, timestamp: new Date().toISOString() });
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      return handleChat(request, env);
    }

    return makeCorsJson({ error: "Not found" }, { status: 404 });
  },
};

async function handleChat(request: Request, env: Env): Promise<Response> {
  let payload: ChatRequestBody;

  try {
    payload = (await request.json()) as ChatRequestBody;
  } catch {
    return makeCorsJson({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const normalizedMessages = normalizeMessages(payload.messages);
  if (!normalizedMessages.length) {
    return makeCorsJson({ error: "At least one user message is required." }, { status: 400 });
  }

  const modelId = payload.model ?? env.DEFAULT_MODEL ?? DEFAULT_MODEL_FALLBACK;
  const systemPrompt = payload.system ?? env.SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT;

  const aiMessages: AiMessage[] = [
    {
      role: "system",
      content: [{ type: "text", text: systemPrompt }],
    },
    ...normalizedMessages.map(
      (message): AiMessage => ({
        role: message.role,
        content: [{ type: "text", text: message.content }],
      }),
    ),
  ];

  try {
    const aiResult = (await (env.AI.run as Ai["run"])(
      modelId as Parameters<Ai["run"]>[0],
      {
        messages: aiMessages,
        temperature: clamp(payload.temperature, 0, 1) ?? 0.3,
        max_tokens: clamp(payload.max_tokens, 32, 1024) ?? 600,
        top_p: clamp(payload.top_p, 0, 1) ?? 0.9,
      } as Parameters<Ai["run"]>[1],
    )) as unknown;

    const assistantText = extractAssistantText(aiResult);

    return makeCorsJson({
      model: modelId,
      response: assistantText,
      raw: aiResult,
    });
  } catch (error) {
    console.error("AI invocation failed", error);
    return makeCorsJson(
      {
        error: "Unable to generate AI response.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 },
    );
  }
}

function normalizeMessages(messages: ChatMessage[] | undefined): DialogueTurn[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((message) => ({
      role: normalizeRole(message.role),
      content: String(message.content ?? "").trim(),
    }))
    .filter((message) => message.content.length > 0);
}

function normalizeRole(role: ChatMessage["role"] | undefined): DialogueTurn["role"] {
  if (role === "assistant") return "assistant";
  return "user";
}

function extractAssistantText(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }

  if (result && typeof result === "object") {
    if ("response" in result && typeof (result as { response: string }).response === "string") {
      return (result as { response: string }).response;
    }

    if ("result" in result && result.result && typeof result.result === "object") {
      const maybeNested = result.result as { output_text?: string; text?: string; responses?: string[] };
      if (maybeNested.output_text) return maybeNested.output_text;
      if (maybeNested.text) return maybeNested.text;
      if (Array.isArray(maybeNested.responses) && maybeNested.responses.length) {
        return maybeNested.responses.join("\n\n");
      }
    }

    if ("outputs" in result && Array.isArray((result as { outputs: unknown[] }).outputs)) {
      const first = (result as { outputs: unknown[] }).outputs[0];
      if (first && typeof first === "object" && "content" in first) {
        const content = (first as { content?: string | string[] }).content;
        if (typeof content === "string") return content;
        if (Array.isArray(content)) return content.join("\n");
      }
    }
  }

  return "No textual response returned by model.";
}

function clamp(value: number | undefined, min: number, max: number): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }
  return Math.min(Math.max(value, min), max);
}

function makeCorsResponse(body: BodyInit | null, init: ResponseInit = {}): Response {
  const response = new Response(body, init);
  Object.entries(CORS_HEADERS).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}

function makeCorsJson(body: unknown, init: ResponseInit = {}): Response {
  const headers = {
    "Content-Type": "application/json",
    ...init.headers,
  };
  return makeCorsResponse(JSON.stringify(body, null, 2), {
    ...init,
    headers,
  });
}

