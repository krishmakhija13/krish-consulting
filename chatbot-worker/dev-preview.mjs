/* Local preview for the chat widget. Serves the site on http://localhost:4173
   and answers /api/chat with canned replies, so you can click through the UI
   without deploying the Worker or using a key.

   Run from the repo root:  node chatbot-worker/dev-preview.mjs

   The replies below are hard-coded samples, NOT the model. To test what the
   assistant actually says, use test/prompt-tests.mjs. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8'
};

const CANNED = [
  'We build the systems rather than just advising on them. Recent work includes spoilage forecasting for a grocery retailer, an AI location-intelligence model for a home-textiles manufacturer, and an autonomous sales-calling agent for a study-abroad edtech.\n\nFor specifics, email krish@krish.consulting.',
  'For a grocery retailer we reduced spoilage 40% in the dairy category — that is the dairy scope specifically.',
  'Scope decides both price and timeline, so there is no rate to quote here. Send a note to krish@krish.consulting with what you are trying to fix.'
];
let turn = 0;

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let count = 0;
      try { count = JSON.parse(body).messages.length; } catch {}
      console.log(`  /api/chat (mock)  messages=${count}`);
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ reply: CANNED[turn++ % CANNED.length] }));
      }, 450);
    });
    return;
  }

  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end('not found'); return; }

  let data = fs.readFileSync(file);
  const ext = path.extname(file);
  if (ext === '.html') {
    // Point the widget at the mock endpoint instead of the deployed Worker.
    data = Buffer.from(
      data.toString('utf8').replace(/src="chat\.js\?v=1"/g, 'src="chat.js?v=1" data-endpoint="/api/chat"')
    );
  }
  res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(data);
});

server.listen(PORT, () => {
  console.log(`krish.consulting preview  →  http://localhost:${PORT}`);
  console.log('chat replies are canned samples, not the model\n');
});
