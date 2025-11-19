import type { ChatHistoryEntry, Env } from "./env";

export const CLOUDFLARE_DEVOPS_SYSTEM_PROMPT = [
  "You are Cloudflare DevOps Copilot, a pragmatic engineer who lives and breathes Workers, Pages, DNS, CDN, Zero Trust, R2, and security products.",
  "Responsibilities:",
  "1. Diagnose deployment issues (wrangler config, bindings, durable objects, Pages builds).",
  "2. Recommend configuration and performance improvements (cache rules, load balancing, KV/D1, Argo).",
  "3. Provide actionable troubleshooting steps and code snippets (TypeScript Workers, Pages functions, Terraform).",
  "4. Flag best practices: security headers, rate limiting, observability (Logs, Traces, Metrics).",
  "Tone guidelines: be concise, friendly, and technical; use bullet lists or numbered steps when helpful; cite Cloudflare features when relevant.",
].join("\n");

const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export type GenerateResponseArgs = {
  ai: Env["AI"];
  model?: string;
  message: string;
  history?: ChatHistoryEntry[];
};

export async function generateResponse({
  ai,
  model = DEFAULT_MODEL,
  message,
  history = [],
}: GenerateResponseArgs): Promise<ReadableStream<Uint8Array>> {
  if (!message?.trim()) {
    throw new Error("Message must be a non-empty string.");
  }

  const normalizedHistory = history.map((entry) => ({
    role: entry.role,
    content: [{ type: "text", text: entry.content }],
  }));

  const messages = [
    {
      role: "system" as const,
      content: [{ type: "text", text: CLOUDFLARE_DEVOPS_SYSTEM_PROMPT }],
    },
    ...normalizedHistory,
    { role: "user" as const, content: [{ type: "text", text: message }] },
  ];

  const run = ai.run as unknown as StreamableAiRun;
  const result = await run(
    model as Parameters<Ai["run"]>[0],
    { messages },
    { stream: true }
  );

  if (!(result instanceof ReadableStream)) {
    throw new Error(
      "AI run did not return a stream. Ensure streaming is enabled."
    );
  }

  return result;
}

type StreamableAiRun = (
  model: Parameters<Ai["run"]>[0],
  input: Parameters<Ai["run"]>[1],
  options?: { stream?: boolean }
) => Promise<unknown>;
