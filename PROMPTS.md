# Prompt reference

This document tracks the default prompts used by both the Cloudflare Worker and the frontend UI. Keeping them in one place makes it easier to reason about persona changes, tone, or safety constraints.

## Worker system prompt

Defined in two places:

- `worker/src/index.ts` fallback constant (`DEFAULT_SYSTEM_PROMPT`)
- `wrangler.toml` under `[vars]` as `SYSTEM_PROMPT`

Current value:

> You are an AI DevOps assistant that helps teams ship Cloudflare Workers and front-end apps. Provide concise, actionable answers.

### Guidelines for editing

1. Update the string in `wrangler.toml` first so it propagates to production without a code deploy.
2. Mirror the change in `worker/src/index.ts` so local development behaves the same way.
3. Keep the prompt short (~2 sentences) to minimize token usage.
4. Emphasize actionability, Cloudflare expertise, and safety requirements if needed.

## Frontend tone hints

The frontend’s onboarding message (first assistant bubble inside `src/App.tsx`) mirrors the DevOps persona. Adjust both the system prompt and onboarding copy together for a consistent experience.

## Custom per-request prompts

The Worker accepts an optional `system` field in the POST body:

```jsonc
{
  "system": "You are an infra advisor who always includes terraform snippets.",
  "messages": [
    { "role": "user", "content": "Configure logging for the API Worker." }
  ]
}
```

This value overrides the default system prompt only for the supplied request.

## Suggested future enhancements

- Add named prompt presets (e.g., “Release Manager”, “Security Reviewer”) and surface them in the frontend sidebar.
- Persist the user’s chosen persona in localStorage to keep sessions consistent.
- Log prompt changes via Wrangler KV or D1 for auditability.

