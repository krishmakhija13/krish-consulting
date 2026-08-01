/* Input validation, Gemini mapping, and .env key-loading tests.
   No API key or network needed.  Run:  node test/validation-tests.mjs */
import { writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateMessages, toGeminiContent, extractReply } from '../src/index.js';
import { keyFromEnvFile } from './load-key.mjs';

const u = (c) => ({ role: 'user', content: c });
const a = (c) => ({ role: 'assistant', content: c });

// A valid alternating thread of `n` messages, user first.
function thread(n) {
  return Array.from({ length: n }, (_, i) => (i % 2 === 0 ? u('hi') : a('hello')));
}

const CASES = [
  ['accepts a single user message', [u('hi')], true],
  ['accepts a full 19-message thread', thread(19), true],
  ['rejects a non-array', { 0: u('hi') }, false],
  ['rejects a string', 'hi', false],
  ['rejects undefined', undefined, false],
  ['rejects an empty array', [], false],
  ['rejects 21 messages', thread(21), false],
  ['rejects a system role', [{ role: 'system', content: 'x' }], false],
  ['rejects an unknown role', [{ role: 'tool', content: 'x' }], false],
  ['rejects non-string content', [{ role: 'user', content: { text: 'x' } }], false],
  ['rejects an array content block', [{ role: 'user', content: [{ type: 'text', text: 'x' }] }], false],
  ['rejects blank content', [u('   ')], false],
  ['accepts content at exactly 2000 chars', [u('x'.repeat(2000))], true],
  ['rejects content at 2001 chars', [u('x'.repeat(2001))], false],
  ['rejects an assistant-first thread', [a('hi'), u('hey')], false],
  ['rejects two users in a row', [u('a'), u('b')], false],
  ['rejects a trailing assistant message', [u('a'), a('b')], false],
  ['rejects null entries', [null], false],
  ['rejects a missing role', [{ content: 'x' }], false]
];

let failed = 0;
for (const [label, input, shouldPass] of CASES) {
  const err = validateMessages(input);
  const passed = err === null;
  const ok = passed === shouldPass;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok ? `  (got: ${err ?? 'accepted'})` : ''}`);
}

/* ---- Gemini request/response mapping -------------------------------- */

const eq = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok ? `  (got: ${JSON.stringify(actual)})` : ''}`);
};

console.log('');
eq('maps user → user with a parts array',
  toGeminiContent(u('hi')), { role: 'user', parts: [{ text: 'hi' }] });
eq('maps assistant → model',
  toGeminiContent(a('hello')), { role: 'model', parts: [{ text: 'hello' }] });
eq('maps a whole thread in order',
  [u('a'), a('b'), u('c')].map(toGeminiContent).map((m) => m.role),
  ['user', 'model', 'user']);

const reply = (parts, extra = {}) => ({ candidates: [{ content: { parts, role: 'model' }, ...extra }] });

eq('extracts a single text part',
  extractReply(reply([{ text: 'Hello there.' }])), 'Hello there.');
eq('joins multiple text parts',
  extractReply(reply([{ text: 'One. ' }, { text: 'Two.' }])), 'One. Two.');
eq('drops thinking parts',
  extractReply(reply([{ text: 'internal reasoning', thought: true }, { text: 'Visible answer.' }])),
  'Visible answer.');
eq('returns empty when only a thought comes back',
  extractReply(reply([{ text: 'reasoning', thought: true }], { finishReason: 'MAX_TOKENS' })), '');
eq('returns empty on a safety block',
  extractReply({ promptFeedback: { blockReason: 'SAFETY' } }), '');
eq('returns empty on no candidates',
  extractReply({ candidates: [] }), '');
eq('returns empty on a malformed body',
  extractReply({}), '');
eq('returns empty on null',
  extractReply(null), '');
eq('trims surrounding whitespace',
  extractReply(reply([{ text: '\n  Answer.  \n' }])), 'Answer.');

/* ---- .env key loading ------------------------------------------------ */

// Writes to a temp file, never to the real chatbot-worker/.env.
const tmp = path.join(os.tmpdir(), `kc-env-test-${process.pid}`);

const envCase = (label, body, expected) => {
  writeFileSync(tmp, body);
  eq(label, keyFromEnvFile(tmp), expected);
};

console.log('');
envCase('reads a bare value', 'GEMINI_API_KEY=abc123\n', 'abc123');
envCase('strips double quotes', 'GEMINI_API_KEY="abc123"\n', 'abc123');
envCase('strips single quotes', "GEMINI_API_KEY='abc123'\n", 'abc123');
envCase('tolerates spaces around =', 'GEMINI_API_KEY = abc123\n', 'abc123');
envCase('tolerates an export prefix', 'export GEMINI_API_KEY=abc123\n', 'abc123');
envCase('skips comments and blank lines',
  '# a comment\n\nGEMINI_API_KEY=abc123\n\n', 'abc123');
envCase('ignores a commented-out key', '#GEMINI_API_KEY=abc123\n', '');
envCase('returns empty for an unset key', 'GEMINI_API_KEY=\n', '');
envCase('returns empty for whitespace only', 'GEMINI_API_KEY=   \n', '');
envCase('ignores other variables', 'OTHER=xyz\nGEMINI_API_KEY=abc123\n', 'abc123');
envCase('handles CRLF line endings', 'GEMINI_API_KEY=abc123\r\n', 'abc123');
// Deliberately not shaped like a real key, so secret scanners stay quiet.
envCase('keeps dots, dashes and underscores in the value',
  'GEMINI_API_KEY=EXAMPLE.not-a_real-key\n', 'EXAMPLE.not-a_real-key');
eq('returns empty when the file is missing',
  keyFromEnvFile(path.join(os.tmpdir(), 'kc-env-does-not-exist')), '');

rmSync(tmp, { force: true });

console.log(failed === 0 ? '\nAll tests passed.' : `\n${failed} test(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
