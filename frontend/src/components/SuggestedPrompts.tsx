type SuggestedPromptsProps = {
  onSelect: (prompt: string) => void;
};

const prompts = [
  "How do I deploy a Worker?",
  "Debug CORS issues in my Worker",
  "Optimize Worker performance",
  "Set up custom domain on Pages",
  "Configure DNS for my domain",
];

export function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
  return (
    <section className="space-y-4 rounded-3xl border border-white/10 bg-cf-graphite/80 p-6 shadow-panel-glow">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-white/60">Suggested prompts</p>
        <h2 className="mt-1 text-xl font-semibold text-white">DevOps starters</h2>
      </div>
      <div className="space-y-3">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSelect(prompt)}
            className="w-full rounded-2xl border border-white/10 bg-cf-charcoal/70 px-4 py-3 text-left text-sm text-white/90 transition hover:border-cf-orange hover:bg-cf-charcoal"
          >
            {prompt}
          </button>
        ))}
      </div>
    </section>
  );
}

