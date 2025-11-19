import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Role = "user" | "assistant";

type Message = {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  pending?: boolean;
};

type ApiResponse = {
  response?: string;
  error?: string;
  raw?: Record<string, unknown>;
};

const API_BASE_URL =
  (import.meta.env.VITE_WORKER_BASE_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://127.0.0.1:8787";

const quickPrompts = [
  "Summarize the deployment pipeline for this project.",
  "Help me design an observability strategy for the Worker.",
  "Outline tasks to add authentication to the chat frontend.",
];

const createMessageId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: createMessageId(),
      role: "assistant",
      createdAt: Date.now(),
      content:
        "Hey there! I’m your Cloudflare Workers AI copilot. Ask me about deployment pipelines, observability, or how to wire the frontend to your Worker.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE_URL}/api/health`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(() => setIsHealthy(true))
      .catch(() => setIsHealthy(false));

    return () => controller.abort();
  }, []);

  useEffect(() => {
    viewportRef.current?.scrollTo({
      top: viewportRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const assistantThinking = useMemo(
    () => messages.find((message) => message.pending && message.role === "assistant"),
    [messages],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim() || isSending) return;

    const userMessage: Message = {
      id: createMessageId(),
      role: "user",
      content: input.trim(),
      createdAt: Date.now(),
    };

    const optimisticAssistant: Message = {
      id: createMessageId(),
      role: "assistant",
      content: "Thinking…",
      createdAt: Date.now(),
      pending: true,
    };

    const nextMessages = [...messages, userMessage, optimisticAssistant];
    setMessages(nextMessages);
    setInput("");
    setIsSending(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages
            .filter((message) => message.role !== "assistant" || !message.pending)
            .map(({ role, content }) => ({ role, content })),
        }),
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || data.error) {
        throw new Error(data.error ?? "Worker returned an error.");
      }

      const answer = data.response ?? "I was unable to generate a response.";
      resolveAssistantMessage(optimisticAssistant.id, answer);
    } catch (err) {
      const details = err instanceof Error ? err.message : "Unknown error";
      setError(details);
      resolveAssistantMessage(
        optimisticAssistant.id,
        `I hit an error contacting the Worker:\n${details}`,
      );
    } finally {
      setIsSending(false);
    }
  }

  function resolveAssistantMessage(id: string, content: string) {
    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, content, pending: false } : message,
      ),
    );
  }

  function handlePrompt(prompt: string) {
    setInput(prompt);
  }

  return (
    <div className="min-h-screen bg-slate-950/95 px-4 py-10 text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 lg:flex-row">
        <main className="flex-1 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl">
          <header className="flex flex-col gap-2 border-b border-white/5 px-8 py-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-lg font-semibold text-brand-200 shadow-glow-sm">
                AI
              </span>
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-brand-200">Workers AI</p>
                <h1 className="text-2xl font-semibold text-white">DevOps Copilot</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-white/70">
              <StatusBadge healthy={isHealthy} />
              <span>Connected to {API_BASE_URL}</span>
            </div>
          </header>

          <div className="flex h-[70vh] flex-col px-2 pb-4 pt-2 sm:px-6 md:px-8">
            <div
              ref={viewportRef}
              className="flex-1 space-y-4 overflow-y-auto rounded-2xl bg-slate-950/60 p-4 sm:p-6"
            >
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {assistantThinking && (
                <div className="flex items-center gap-2 text-sm text-white/70">
                  <span className="h-2 w-2 animate-ping rounded-full bg-brand-400" />
                  Generating
                </div>
              )}
            </div>

            {error && (
              <p className="mt-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </p>
            )}

            <form onSubmit={handleSubmit} className="mt-4">
              <label className="sr-only" htmlFor="message">
                Message
              </label>
              <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/5 p-3 sm:flex-row sm:items-end">
                <textarea
                  id="message"
                  value={input}
                  rows={2}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask about deployment, observability, or feature work…"
                  className="min-h-[72px] flex-1 resize-none rounded-2xl border-none bg-transparent px-4 py-2 text-base text-white placeholder-white/50 outline-none focus:ring-2 focus:ring-brand-400/60"
                />
                <button
                  type="submit"
                  disabled={isSending || !input.trim()}
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-500 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:bg-white/20"
                >
                  {isSending ? "Sending…" : "Send"}
                </button>
              </div>
            </form>
          </div>
        </main>

        <aside className="lg:w-[320px]">
          <section className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-brand-200">Quick prompts</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Jump back in</h2>
            </div>
            <div className="space-y-3">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handlePrompt(prompt)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white/90 transition hover:border-brand-400/60 hover:bg-white/10"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-6 rounded-3xl border border-white/10 bg-gradient-to-br from-brand-500/30 to-brand-700/40 p-6 text-sm text-white/90">
            <h3 className="text-base font-semibold text-white">How it works</h3>
            <ul className="mt-3 space-y-2 text-white/80">
              <li>1. Frontend calls the Worker at `/api/chat`.</li>
              <li>2. Worker invokes Cloudflare Workers AI (`env.AI`).</li>
              <li>3. Response streams back into this UI.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <span className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-brand-500/30 text-xs font-semibold text-brand-100">
          AI
        </span>
      )}
      <div
        className={`max-w-[80%] rounded-3xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-brand-500 text-white shadow-glow-sm"
            : "bg-white/5 text-white/90 backdrop-blur"
        }`}
      >
        {message.content.split("\n").map((line, index) => (
          <p key={index} className="whitespace-pre-wrap">
            {line}
          </p>
        ))}
      </div>
      {isUser && (
        <span className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-white/10 text-xs font-semibold text-white/70">
          You
        </span>
      )}
    </div>
  );
}

function StatusBadge({ healthy }: { healthy: boolean | null }) {
  let text = "Checking Worker…";
  let classes = "text-white/70";

  if (healthy === true) {
    text = "Worker reachable";
    classes = "text-emerald-300";
  } else if (healthy === false) {
    text = "Worker offline";
    classes = "text-red-300";
  }

  return (
    <span className={`inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-1 text-xs ${classes}`}>
      <span
        className={`h-2 w-2 rounded-full ${
          healthy === null ? "bg-yellow-300 animate-pulse" : healthy ? "bg-emerald-300" : "bg-red-300"
        }`}
      />
      {text}
    </span>
  );
}

export default App;
