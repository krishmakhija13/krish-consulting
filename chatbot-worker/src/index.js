/* krish.consulting chat proxy — Cloudflare Worker.
   The Gemini key lives in Worker secrets and never leaves this process.
   Message bodies are never logged. */
import { SYSTEM_PROMPT } from './system-prompt.js';

// GA Flash model. Alternatives: gemini-3.5-flash (GA),
// gemini-3-flash-preview (preview). API_URL and the tests derive from this.
export const MODEL = 'gemini-3.6-flash';
export const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/' +
  MODEL + ':generateContent';
export const MAX_TOKENS = 800;
// Gemini 3 thinks by default and those tokens come out of maxOutputTokens.
// These are two-or-three-sentence answers, so keep thinking low or the visible
// reply can get truncated away entirely.
export const GENERATION_CONFIG = {
  maxOutputTokens: MAX_TOKENS,
  thinkingConfig: { thinkingLevel: 'low' }
};

const MAX_MESSAGES = 20;
const MAX_CHARS = 2000;

const RATE_LIMIT = 15;        // messages
const RATE_WINDOW = 600;      // seconds

const ALLOWED_ORIGINS = [
  'https://krish.consulting',
  'https://www.krish.consulting'
];

/* ---- CORS ----------------------------------------------------------- */

// EXTRA_ORIGIN is for `wrangler dev` only; it is unset in wrangler.toml,
// so production allows the two origins above and nothing else.
function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (env.EXTRA_ORIGIN && origin === env.EXTRA_ORIGIN) return origin;
  return null;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(body, status, origin, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign(
      {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      },
      origin ? corsHeaders(origin) : {},
      extra || {}
    )
  });
}

/* ---- Validation ------------------------------------------------------ */

// Returns an error string, or null when the thread is safe to forward.
// Exported so test/validation-tests.mjs can exercise it without Cloudflare.
export function validateMessages(messages) {
  if (!Array.isArray(messages)) return 'messages must be an array';
  if (messages.length === 0) return 'messages must not be empty';
  if (messages.length > MAX_MESSAGES) return `messages must contain at most ${MAX_MESSAGES} entries`;

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || typeof m !== 'object' || Array.isArray(m)) return `message ${i} must be an object`;
    if (m.role !== 'user' && m.role !== 'assistant') return `message ${i} has an unsupported role`;
    if (typeof m.content !== 'string') return `message ${i} content must be a string`;
    if (m.content.trim().length === 0) return `message ${i} content must not be empty`;
    if (m.content.length > MAX_CHARS) return `message ${i} exceeds ${MAX_CHARS} characters`;
    // Keep threads user-first and strictly alternating.
    const expected = i % 2 === 0 ? 'user' : 'assistant';
    if (m.role !== expected) return 'messages must start with user and alternate roles';
  }
  if (messages[messages.length - 1].role !== 'user') return 'the last message must be from user';
  return null;
}

/* ---- Gemini mapping -------------------------------------------------- */

// Our wire format (user/assistant + content string) → Gemini's
// (user/model + parts array). Exported for tests.
export function toGeminiContent(message) {
  return {
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }]
  };
}

// Pull the visible answer out of a generateContent response. Thinking parts
// come back flagged `thought: true` and must never reach the browser.
export function extractReply(data) {
  const candidate = (data && data.candidates && data.candidates[0]) || null;
  if (!candidate || !candidate.content || !Array.isArray(candidate.content.parts)) return '';
  return candidate.content.parts
    .filter(function (part) { return !part.thought && typeof part.text === 'string'; })
    .map(function (part) { return part.text; })
    .join('')
    .trim();
}

/* ---- Rate limit ------------------------------------------------------ */

// Fixed window per IP in KV. KV is eventually consistent, so a client racing
// requests across colos can slip a few over the cap — acceptable for abuse
// damping, and the cost ceiling is still bounded.
async function checkRate(env, ip) {
  if (!env.CHAT_RL) return { ok: true, retryAfter: 0 };  // no namespace bound: fail open, don't break chat

  const key = `rl:${ip}`;
  const now = Math.floor(Date.now() / 1000);

  let record = null;
  try {
    const raw = await env.CHAT_RL.get(key);
    if (raw) record = JSON.parse(raw);
  } catch (e) {
    record = null;
  }
  if (!record || typeof record.reset !== 'number' || typeof record.count !== 'number' || record.reset <= now) {
    record = { count: 0, reset: now + RATE_WINDOW };
  }

  record.count += 1;
  const retryAfter = Math.max(1, record.reset - now);

  try {
    // KV enforces a 60s floor on expirationTtl.
    await env.CHAT_RL.put(key, JSON.stringify(record), { expirationTtl: Math.max(60, retryAfter) });
  } catch (e) {
    return { ok: true, retryAfter: 0 };
  }

  return { ok: record.count <= RATE_LIMIT, retryAfter };
}

/* ---- Handler -------------------------------------------------------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);

    if (request.method === 'OPTIONS') {
      if (!origin) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname !== '/api/chat') return json({ error: 'Not found' }, 404, origin);
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin, { Allow: 'POST, OPTIONS' });
    if (!origin) return json({ error: 'Forbidden' }, 403, null);

    if (!env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY is not configured');
      return json({ error: 'Chat is unavailable right now.' }, 503, origin);
    }

    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return json({ error: 'Body must be valid JSON.' }, 400, origin);
    }

    const invalid = validateMessages(payload && payload.messages);
    if (invalid) return json({ error: invalid }, 400, origin);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rate = await checkRate(env, ip);
    if (!rate.ok) {
      return json(
        { error: 'That’s a lot of questions. Try again in a few minutes, or email krish@krish.consulting.' },
        429,
        origin,
        { 'Retry-After': String(rate.retryAfter) }
      );
    }

    // The wire format stays user/assistant; Gemini wants user/model.
    const contents = payload.messages.map(toGeminiContent);

    let upstream;
    try {
      upstream = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: contents,
          generationConfig: GENERATION_CONFIG
        })
      });
    } catch (e) {
      console.error('upstream request failed');
      return json({ error: 'Chat is unavailable right now.' }, 502, origin);
    }

    if (!upstream.ok) {
      // Status only — never the response body, which can echo message content.
      console.error('gemini error status', upstream.status);
      // 429 here is Gemini quota, not our own per-IP limit; same fallback copy.
      const status = upstream.status === 429 ? 429 : 502;
      return json({ error: 'Chat is unavailable right now.' }, status, origin);
    }

    let data;
    try {
      data = await upstream.json();
    } catch (e) {
      console.error('could not parse upstream response');
      return json({ error: 'Chat is unavailable right now.' }, 502, origin);
    }

    const reply = extractReply(data);

    if (!reply) {
      // Empty candidates means a safety block or a MAX_TOKENS cutoff that left
      // nothing visible. Log the reason code only — never the text.
      const candidate = (data.candidates || [])[0];
      console.error(
        'gemini returned no text',
        (data.promptFeedback && data.promptFeedback.blockReason) ||
          (candidate && candidate.finishReason) ||
          'unknown'
      );
      return json({ error: 'Chat is unavailable right now.' }, 502, origin);
    }

    return json({ reply: reply }, 200, origin);
  }
};
