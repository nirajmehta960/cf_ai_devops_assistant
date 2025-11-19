import type { ChatHistoryEntry, Env } from "../env";

const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct";
const SYSTEM_PROMPT =
  "You are a DevOps assistant focused on Cloudflare products. Provide pragmatic, security-minded guidance and cite relevant Workers/Pages/AI features.";
const HISTORY_LIMIT = 10;

type ChatPayload = {
  message?: string;
};

type AiStreamResult = {
  stream: ReadableStream<Uint8Array>;
  transcript: Promise<string>;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
type AiRunWithStream = (
  model: Parameters<Ai["run"]>[0],
  input: Parameters<Ai["run"]>[1],
  options?: { stream?: boolean },
) => Promise<unknown>;

export class ChatSession implements DurableObject {
  private historyCache: ChatHistoryEntry[] | null = null;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, { status: 405 });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/chat") {
      return jsonResponse({ error: "Not found" }, { status: 404 });
    }

    let payload: ChatPayload;
    try {
      payload = (await request.json()) as ChatPayload;
    } catch {
      return jsonResponse({ error: "Invalid JSON body." }, { status: 400 });
    }

    const message = payload.message?.trim();
    if (!message) {
      return jsonResponse({ error: "`message` is required." }, { status: 400 });
    }

    const history = await this.getHistory();

    try {
      const { stream, transcript } = await this.generateAIResponse(message, history);

      transcript
        .then(async (reply) => {
          const updated = this.trimHistory([
            ...history,
            { role: "user", content: message },
            { role: "assistant", content: reply },
          ]);
          await this.saveHistory(updated);
        })
        .catch((error) => console.error("Failed to persist chat history", error));

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    } catch (error) {
      console.error("AI generation failed", error);
      return jsonResponse(
        {
          error: "AI generation failed.",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 502 },
      );
    }
  }

  async getHistory(): Promise<ChatHistoryEntry[]> {
    if (this.historyCache) {
      return [...this.historyCache];
    }
    const stored = await this.state.storage.get<ChatHistoryEntry[]>("history");
    this.historyCache = stored ?? [];
    return [...this.historyCache];
  }

  async saveHistory(history: ChatHistoryEntry[]): Promise<void> {
    this.historyCache = this.trimHistory(history);
    await this.state.storage.put("history", this.historyCache);
  }

  private trimHistory(history: ChatHistoryEntry[]): ChatHistoryEntry[] {
    if (history.length <= HISTORY_LIMIT) {
      return history;
    }
    return history.slice(history.length - HISTORY_LIMIT);
  }

  async generateAIResponse(message: string, history: ChatHistoryEntry[]): Promise<AiStreamResult> {
    const context = [
      {
        role: "system" as const,
        content: [{ type: "text", text: SYSTEM_PROMPT }],
      },
      ...history.map((entry) => ({
        role: entry.role,
        content: [{ type: "text", text: entry.content }],
      })),
      {
        role: "user" as const,
        content: [{ type: "text", text: message }],
      },
    ];

    const model = (this.env.DEFAULT_MODEL ?? DEFAULT_MODEL) as Parameters<Ai["run"]>[0];
    const aiRun = this.env.AI.run as unknown as AiRunWithStream;
    const aiResult = await aiRun(
      model,
      { messages: context },
      { stream: true },
    );

    if (aiResult instanceof ReadableStream) {
      const [clientStream, historyStream] = aiResult.tee();
      return {
        stream: clientStream,
        transcript: collectText(historyStream),
      };
    }

    const fallbackText = extractResponseText(aiResult);
    return {
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(textEncoder.encode(fallbackText));
          controller.close();
        },
      }),
      transcript: Promise.resolve(fallbackText),
    };
  }
}

function extractResponseText(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  if (result && typeof result === "object") {
    if ("response" in result && typeof (result as { response?: string }).response === "string") {
      return (result as { response?: string }).response as string;
    }
    if ("output_text" in result && typeof (result as { output_text?: string }).output_text === "string") {
      return (result as { output_text?: string }).output_text as string;
    }
  }
  return "I was unable to generate a response.";
}

function collectText(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = stream.getReader();
    let result = "";

    function read() {
      reader
        .read()
        .then(({ done, value }) => {
          if (done) {
            result += textDecoder.decode();
            resolve(result);
            return;
          }
          if (value) {
            result += textDecoder.decode(value, { stream: true });
          }
          read();
        })
        .catch((error) => reject(error));
    }

    read();
  });
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers,
  });
}

