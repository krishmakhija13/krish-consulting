// ============================================================
// /api/chat  —  Gemini proxy with streaming, rate limiting, input validation
// ============================================================

const { SYSTEM_PROMPT } = require('../config/systemPrompt');
const { setCorsHeaders } = require('../lib/cors');

// ------ Provider config -----------------------------------------------
// Change these two constants (or set the env vars) to swap to a different LLM provider.
// The Gemini streaming endpoint format: {BASE_URL}/models/{MODEL}:streamGenerateContent
const LLM_MODEL    = process.env.LLM_MODEL    || 'gemini-2.5-flash';
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
// ----------------------------------------------------------------------

const MAX_MESSAGE_LENGTH  = 2000;  // characters per user message
const MAX_HISTORY_TURNS   = 20;    // max history messages forwarded to the LLM

// Simple in-memory rate limiter (resets on cold-start — fine for a personal site)
const RATE_WINDOW_MS  = 60_000;
const RATE_MAX        = 10;       // requests per IP per minute
const ipBucket        = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  let rec = ipBucket.get(ip);
  if (!rec || now > rec.resetAt) {
    rec = { count: 1, resetAt: now + RATE_WINDOW_MS };
  } else {
    rec.count += 1;
  }
  ipBucket.set(ip, rec);
  // Prune stale entries to avoid unbounded memory growth
  if (ipBucket.size > 5000) {
    for (const [k, v] of ipBucket) {
      if (now > v.resetAt) ipBucket.delete(k);
    }
  }
  return rec.count > RATE_MAX;
}

const MSG_RATE_LIMITED = "I'm getting a lot of questions right now — please try again in a moment, or email krish13ts@gmail.com";
const MSG_ERROR        = "I'm having trouble connecting right now — please email krish13ts@gmail.com";

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // Rate limiting
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'rate_limited', message: MSG_RATE_LIMITED });
  }

  // Input validation
  const { message, history } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Missing message' });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      error: 'Message too long',
      message: `Please keep messages under ${MAX_MESSAGE_LENGTH} characters.`,
    });
  }

  // Trim + sanitise history
  const trimmedHistory = (Array.isArray(history) ? history : [])
    .slice(-MAX_HISTORY_TURNS)
    .filter(t => t && typeof t.role === 'string' && typeof t.content === 'string')
    .map(t => ({
      role: t.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(t.content).slice(0, MAX_MESSAGE_LENGTH) }],
    }));

  const contents = [
    ...trimmedHistory,
    { role: 'user', parts: [{ text: message.trim() }] },
  ];

  // API key check
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[chat] GEMINI_API_KEY is not set');
    return res.status(500).json({ error: 'config_error', message: MSG_ERROR });
  }

  const url = `${LLM_BASE_URL}/models/${LLM_MODEL}:streamGenerateContent?key=${apiKey}&alt=sse`;

  // Call Gemini
  let geminiRes;
  try {
    geminiRes = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          temperature:      0.7,
          maxOutputTokens:  1024,
        },
      }),
    });
  } catch (err) {
    console.error('[chat] Gemini fetch failed:', err.message);
    return res.status(502).json({ error: 'upstream_error', message: MSG_ERROR });
  }

  if (geminiRes.status === 429) {
    return res.status(429).json({ error: 'rate_limited', message: MSG_RATE_LIMITED });
  }
  if (!geminiRes.ok) {
    const body = await geminiRes.text().catch(() => '(unreadable)');
    console.error(`[chat] Gemini error ${geminiRes.status}:`, body);
    return res.status(502).json({ error: 'upstream_error', message: MSG_ERROR });
  }

  // Stream SSE back to the client
  res.setHeader('Content-Type',     'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control',    'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering','no');
  res.setHeader('Connection',       'keep-alive');
  res.flushHeaders();

  const reader  = geminiRes.body.getReader();
  const decoder = new TextDecoder();
  let   buf     = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });

      // Process complete SSE lines; keep any incomplete trailing chunk in buf
      const lines = buf.split('\n');
      buf = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;

        let parsed;
        try { parsed = JSON.parse(data); } catch { continue; }

        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }

        // Surface finish-reason errors (e.g. safety blocks) to the client
        const finishReason = parsed?.candidates?.[0]?.finishReason;
        if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
          res.write(`data: ${JSON.stringify({ error: MSG_ERROR })}\n\n`);
        }
      }
    }
  } catch (err) {
    console.error('[chat] Stream read error:', err.message);
    res.write(`data: ${JSON.stringify({ error: MSG_ERROR })}\n\n`);
  }

  res.write('data: [DONE]\n\n');
  res.end();
};
