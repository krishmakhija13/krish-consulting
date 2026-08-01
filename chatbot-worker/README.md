# krish.consulting chat — Worker

The browser talks only to this Worker. The Gemini key lives in Worker secrets
and is never sent to the client, never committed, and never written to
`wrangler.toml`.

- Upstream: Google AI Studio, `gemini-3.6-flash`, `maxOutputTokens` 800,
  `thinkingLevel: low` (Gemini 3 thinks by default and those tokens come out of
  the same budget, which would otherwise truncate short answers)
- Endpoint: `POST /api/chat` → `{ messages: [{ role, content }] }` → `{ reply }`
  — the browser wire format stays `user`/`assistant`; the Worker maps to
  Gemini's `user`/`model` `contents` at the edge, so the widget is unaffected
- Limits: 20 messages per request, 2000 chars each, roles `user`/`assistant` only
- CORS: `https://krish.consulting` and `https://www.krish.consulting` only
- Rate limit: 15 messages per IP per 10 minutes, tracked in KV
- Message bodies are never logged — only HTTP status codes on failure

## Deploy

```bash
cd chatbot-worker
npm install
npx wrangler login
```

Create the rate-limit namespace and paste the printed id into `wrangler.toml`
under `[[kv_namespaces]]`:

```bash
npx wrangler kv namespace create CHAT_RL
```

Set the key (prompts for the value; it is not echoed or stored locally):

```bash
npx wrangler secret put GEMINI_API_KEY
```

Deploy:

```bash
npx wrangler deploy
```

`wrangler deploy` prints the Worker URL. Put `<that-url>/api/chat` into
`chat.js` — either as the `ENDPOINT` fallback at the top of the file, or as
`data-endpoint="…"` on the four `<script src="chat.js">` tags.

## Local preview

Serves the site with a mock `/api/chat` so you can click through the widget
without deploying anything. Run from the repo root:

```bash
node chatbot-worker/dev-preview.mjs
```

Then open http://localhost:4173. The replies are canned samples, not the model.

## Tests

Input validation and Gemini request/response mapping — no key or network needed:

```bash
node test/validation-tests.mjs
```

Assistant behaviour — needs your key, calls Gemini directly with the exact
prompt, model and generation config the Worker sends. Run this before shipping
and read the replies:

```bash
node test/prompt-tests.mjs
```

The key comes from `chatbot-worker/.env`, which is gitignored — put it after
`GEMINI_API_KEY=` on the last line, with no quotes and no spaces. A
`GEMINI_API_KEY` environment variable overrides the file if you'd rather not
have the key on disk at all.

This `.env` is for tests only. The deployed Worker reads its key from Worker
secrets and never touches the file.

## Editing the facts

`src/system-prompt.js` is the only place the assistant's knowledge lives. Add or
change a fact there and redeploy. The numeric guardrails in the prompt (dairy
scope on 40%, "up to 2x" not "doubled", "coinciding with" for the jewellery
engagement) are load-bearing — if you reword a fact, re-run the behaviour tests.

## Notes

- KV is eventually consistent, so a client racing requests across Cloudflare
  locations can slip slightly past 15. It damps abuse; it isn't a hard quota.
- If the KV binding is missing the Worker serves chat without rate limiting
  rather than failing closed. Keep the binding configured.
- Requests without an allowed `Origin` header get 403, so `curl` can't use the
  key. Local Worker testing: `npx wrangler dev --var EXTRA_ORIGIN:http://localhost:4173`
