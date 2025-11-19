import { FormEvent, KeyboardEvent, useEffect, useRef } from "react";

type MessageInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  isSending: boolean;
  maxLength?: number;
};

const DEFAULT_MAX = 2000;

export function MessageInput({
  value,
  onChange,
  onSubmit,
  isSending,
  maxLength = DEFAULT_MAX,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isDisabled = isSending || !value.trim();

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`;
  }, [value]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDisabled) return;
    onSubmit(value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (!isDisabled) {
        onSubmit(value);
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-[#141414]/90 p-3 shadow-panel-glow sm:flex-row sm:items-end">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value.slice(0, maxLength))}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder="Ask about deployments, config, or performance…"
          className="min-h-[72px] flex-1 resize-none rounded-2xl border border-white/10 bg-[#1f1f1f]/95 px-4 py-2 text-base text-white placeholder-white/60 outline-none focus:border-cf-orange focus:ring-0"
        />
        <div className="flex flex-col items-end gap-3 sm:w-40">
          <span className="text-xs text-white/60">
            {value.length}/{maxLength} chars
          </span>
          <button
            type="submit"
            disabled={isDisabled}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cf-orange px-4 py-2 text-sm font-semibold uppercase tracking-wide text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/40"
          >
            {isSending && <Spinner />}
            {isSending ? "Sending" : "Send"}
          </button>
        </div>
      </div>
    </form>
  );
}

function Spinner() {
  return (
    <span
      className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black"
      aria-hidden
    />
  );
}
