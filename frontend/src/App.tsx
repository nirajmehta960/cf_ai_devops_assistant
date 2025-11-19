import { useEffect, useMemo, useRef, useState } from "react";
import { ChatWindow } from "./components/ChatWindow";
import { MessageInput } from "./components/MessageInput";
import { SuggestedPrompts } from "./components/SuggestedPrompts";
import type { Message } from "./types/chat";

type ApiResponse = {
  response?: string;
  error?: string;
  raw?: Record<string, unknown>;
};

const API_BASE_URL =
  (import.meta.env.VITE_WORKER_BASE_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://127.0.0.1:8787";

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
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE_URL}/api/health`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(() => setIsHealthy(true))
      .catch(() => setIsHealthy(false));

    return () => controller.abort();
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const assistantThinking = useMemo(
    () => messages.find((message) => message.pending && message.role === "assistant"),
    [messages],
  );

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content) return;

    const userMessage: Message = {
      id: createMessageId(),
      role: "user",
      content,
      createdAt: Date.now(),
    };

    const optimisticAssistant: Message = {
      id: createMessageId(),
      role: "assistant",
      content: "Thinking…",
      createdAt: Date.now(),
      pending: true,
    };

    const nextMessages = [...messagesRef.current, userMessage, optimisticAssistant];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
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

  async function handleComposerSubmit(value: string) {
    if (isSending || !value.trim()) return;
    setInput("");
    await sendMessage(value);
  }

  function resolveAssistantMessage(id: string, content: string) {
    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, content, pending: false } : message,
      ),
    );
  }

  async function handlePrompt(prompt: string) {
    if (isSending) return;
    await sendMessage(prompt);
  }

  return (
    <div className="min-h-screen bg-cf-dark px-4 py-6 text-white sm:py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:flex-row">
        <main className="flex-1 rounded-3xl border border-white/5 bg-cf-graphite/80 shadow-panel-glow backdrop-blur">
          <header className="space-y-4 border-b border-white/10 px-6 py-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-white/60">Cloudflare Workers AI</p>
                <h1 className="text-3xl font-semibold text-white">CF DevOps Assistant</h1>
              </div>
              <StatusBadge healthy={isHealthy} />
            </div>
            <p className="text-sm text-white/60">Connected to {API_BASE_URL}</p>
          </header>

          <div className="flex h-[72vh] flex-col gap-4 px-4 pb-6 pt-4 sm:px-6">
            <ChatWindow messages={messages} isTyping={Boolean(assistantThinking)} />

            {error && (
              <p className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </p>
            )}

            <MessageInput value={input} onChange={setInput} onSubmit={handleComposerSubmit} isSending={isSending} />
          </div>
        </main>

        <aside className="space-y-6 lg:w-[320px]">
          <SuggestedPrompts onSelect={handlePrompt} />

          <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-cf-orange/20 via-cf-orange/10 to-transparent p-6 text-sm text-white/90">
            <h3 className="text-base font-semibold text-white">Playbook</h3>
            <ul className="mt-3 space-y-2 text-white/80">
              <li>1. Describe the issue or goal.</li>
              <li>2. Include relevant Wrangler logs/config.</li>
              <li>3. Ask for fixes, sample code, or best practices.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function StatusBadge({ healthy }: { healthy: boolean | null }) {
  let text = "Checking Worker…";
  let classes = "text-white/70";
  let dot = "bg-yellow-300 animate-pulse";

  if (healthy === true) {
    text = "Worker reachable";
    classes = "text-emerald-300";
    dot = "bg-emerald-300";
  } else if (healthy === false) {
    text = "Worker offline";
    classes = "text-red-300";
    dot = "bg-red-400";
  }

  return (
    <span className={`inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-1 text-xs ${classes}`}>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {text}
    </span>
  );
}

export default App;
