import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/atom-one-dark.css";
import type { Message } from "../types/chat";

type ChatWindowProps = {
  messages: Message[];
  isTyping: boolean;
};

export function ChatWindow({ messages, isTyping }: ChatWindowProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  return (
    <div
      ref={containerRef}
      className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-white/10 bg-cf-charcoal/80 p-4 sm:p-6"
    >
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {isTyping && (
        <div className="flex items-center gap-2 text-sm text-white/70">
          <span className="h-2 w-2 animate-ping rounded-full bg-cf-orange" />
          Cloudflare Copilot is typing…
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <span className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-cf-orange/30 text-xs font-semibold text-cf-orange">
          AI
        </span>
      )}
      <div
        className={`max-w-[80%] rounded-3xl border px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "border-blue-400/40 bg-chat-user text-white shadow-lg"
            : "border-white/5 bg-chat-ai text-white/90"
        }`}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            p: ({ ...props }) => <p className="mb-3 last:mb-0" {...props} />,
            ul: ({ ...props }) => <ul className="mb-3 list-disc pl-4 last:mb-0" {...props} />,
            ol: ({ ...props }) => <ol className="mb-3 list-decimal pl-4 last:mb-0" {...props} />,
            code({ inline, className, children, ...props }) {
              const match = /language-(\w+)/.exec(className ?? "");
              if (inline) {
                return (
                  <code
                    className="rounded bg-black/30 px-1 py-0.5 text-xs font-mono text-white/90"
                    {...props}
                  >
                    {children}
                  </code>
                );
              }
              return (
                <pre className="mb-3 overflow-x-auto rounded-2xl bg-black/70 p-4 text-sm last:mb-0">
                  <code className={match ? `language-${match[1]}` : ""} {...props}>
                    {children}
                  </code>
                </pre>
              );
            },
          }}
        >
          {message.content}
        </ReactMarkdown>
      </div>
      {isUser && (
        <span className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-white/10 text-xs font-semibold text-white/70">
          You
        </span>
      )}
    </div>
  );
}

