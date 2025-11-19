# Cloudflare Workers AI Chat Starter

This repository contains a two-part project that demonstrates how to build a Cloudflare Workers AI backend and a modern React + TailwindCSS chat frontend. The Worker exposes simple API endpoints for health checks and chat completions, while the frontend ships a sleek conversation experience that talks to the Worker.

## Project structure

```
.
├── worker/          # TypeScript Cloudflare Worker + Wrangler config
├── frontend/        # Vite + React + Tailwind chat interface
├── PROMPTS.md       # Extended prompt + persona documentation
└── README.md        # You are here
```

## Prerequisites

- Node.js 20+
- `npm` (ships with Node)
- A Cloudflare account with Workers + Workers AI enabled
- Wrangler CLI (`npm install -g wrangler`, or use `npx wrangler`)

## Worker

**Location:** `worker/`

The Worker exposes:

- `GET /api/health` — lightweight health probe
- `POST /api/chat` — forwards chat turns to Cloudflare Workers AI (`env.AI`) and returns the completion alongside the raw payload

Key files:

- `worker/src/index.ts` — request router, CORS helpers, AI invocation logic
- `worker/wrangler.toml` — Worker metadata, bindings, and defaults
- `worker/tsconfig.json` — strict TypeScript settings tailored for Workers

### Environment

Update `wrangler.toml` with your Worker name and set environment variables if you want to override the default model or system prompt. Bind the Workers AI resource to `AI` (as already defined in the config) either through the dashboard or `wrangler`.

### Commands

```bash
cd worker
npm run dev      # Run locally with wrangler dev
npm run check    # Type-check the Worker
npm run deploy   # Deploy to Cloudflare
```

## Frontend

**Location:** `frontend/`

Built with Vite, React, TypeScript, and TailwindCSS. It features:

- Responsive split layout (chat + helper sidebar)
- Health badge that pings the Worker
- Quick prompt shortcuts
- Optimistic UI with graceful error handling

### Tailwind setup

Tailwind is configured via `tailwind.config.js`, `postcss.config.js`, and the `@tailwind` directives inside `src/index.css`. The design relies on custom brand colors and subtle glows for a futuristic look.

### Environment

Create `frontend/.env` (or `.env.local`) and point the UI to your Worker:

```
VITE_WORKER_BASE_URL=https://your-worker.your-account.workers.dev
```

When omitted, the UI falls back to `http://127.0.0.1:8787` which is Wrangler’s default dev server.

### Commands

```bash
cd frontend
npm install      # (already run when scaffolding, but safe to repeat)
npm run dev      # Start Vite dev server
npm run build    # Type-check and build production assets
npm run lint     # ESLint + TypeScript ESLint config
```

## Development workflow

1. Run `npm run dev` inside `worker/` to start the Worker locally (port `8787` by default).
2. In another terminal, run `npm run dev` inside `frontend/`.
3. Visit `http://localhost:5173` and start chatting — the UI sends requests to the Worker, which proxies to Workers AI.

## Testing the AI endpoint

```bash
curl -X POST http://127.0.0.1:8787/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      { "role": "user", "content": "Give me three deployment tips." }
    ]
  }'
```

## Deployment checklist

- [ ] Configure Workers AI binding named `AI`
- [ ] Optionally set `DEFAULT_MODEL` / `SYSTEM_PROMPT` vars in `wrangler.toml`
- [ ] Run `npm run deploy` inside `worker/`
- [ ] Update `VITE_WORKER_BASE_URL` to the production Worker URL
- [ ] Build the frontend (`npm run build`) and host the `frontend/dist` folder on Pages, Workers Sites, or your preferred static host

## License

MIT — adapt and extend for your own projects. Contributions welcome!
