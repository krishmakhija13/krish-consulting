# Krish Consulting — AI Chatbot

A production-ready AI chat widget powered by Google Gemini (free tier). The widget lives on every page of krish.consulting, answers client questions, and routes leads to you via a configurable webhook.

---

## Architecture

```
Browser (chatbot.js on GitHub Pages)
  └─▶  POST /api/chat   ──▶  Gemini 2.5 Flash  (streams SSE back)
  └─▶  POST /api/lead   ──▶  Google Apps Script / webhook  (saves lead)

chatbot-backend/   ←  deployed to Vercel (free Hobby plan)
```

Everything stays free:
- **LLM**: Google Gemini free tier — 15 req/min, 1,500 req/day, no credit card
- **Backend**: Vercel Hobby plan — serverless functions, free forever
- **Frontend**: GitHub Pages — already where the site lives
- **Lead capture**: Google Apps Script — free, unlimited, stores to Google Sheets

---

## Step 1 — Get a free Gemini API key

1. Go to **https://aistudio.google.com/app/apikey**
2. Sign in with your Google account (no credit card needed)
3. Click **Create API key** → copy the key
4. Keep it safe — you'll paste it into Vercel in Step 3

---

## Step 2 — Set up lead capture (Google Apps Script)

This stores every captured lead in a Google Sheet and optionally emails you.

1. Go to **https://sheets.google.com** → create a new sheet called **Chatbot Leads**
2. Add these headers in row 1: `Timestamp | Name | Email | Message | Source`
3. Open **Extensions → Apps Script**
4. Replace the default code with:

```javascript
function doPost(e) {
  try {
    var data  = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.name    || '',
      data.email   || '',
      data.message || '',
      data.source  || 'chatbot',
    ]);
    // Optional: email notification
    // MailApp.sendEmail('krish13ts@gmail.com', 'New lead: ' + data.name, JSON.stringify(data, null, 2));
    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

5. Click **Deploy → New deployment** → type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy** → copy the **Web app URL** (looks like `https://script.google.com/macros/s/ABC.../exec`)
7. Save this URL — you'll paste it into Vercel as `LEAD_WEBHOOK_URL`

To enable email notifications: uncomment the `MailApp.sendEmail` line in the script.

---

## Step 3 — Deploy the backend to Vercel

1. Install the Vercel CLI (one-time):
   ```bash
   npm install -g vercel
   ```

2. From the `chatbot-backend/` folder:
   ```bash
   cd chatbot-backend
   vercel
   ```
   - Choose: **Deploy to a new project**
   - When asked for the root directory: press Enter (it's already `chatbot-backend/`)
   - Framework preset: **Other**

3. After the first deploy completes, add your environment variables:
   ```bash
   vercel env add GEMINI_API_KEY
   # paste your key when prompted, select: Production + Preview + Development

   vercel env add ALLOWED_ORIGINS
   # value: https://krish.consulting,https://www.krish.consulting

   vercel env add LEAD_WEBHOOK_URL
   # paste your Google Apps Script URL from Step 2
   ```

4. Redeploy to pick up the env vars:
   ```bash
   vercel --prod
   ```

5. Copy your deployment URL, e.g. `https://krish-chatbot.vercel.app`

---

## Step 4 — Connect the frontend to the backend

In each of these files, find the line:
```javascript
window.CHATBOT_BACKEND_URL = '';
```
and replace the empty string with your Vercel URL:
```javascript
window.CHATBOT_BACKEND_URL = 'https://krish-chatbot.vercel.app';
```

Files to update (all 6 pages):
- `index.html`
- `case-studies.html`
- `faq.html`
- `resources.html`
- `research.html`
- `ai-diagnostic.html`

Commit and push — GitHub Pages will serve the updated files within a minute.

---

## Running locally (end-to-end test)

**Terminal 1 — backend:**
```bash
cd chatbot-backend
cp .env.example .env
# edit .env and add your real GEMINI_API_KEY
npx vercel dev
# backend runs at http://localhost:3000
```

**Terminal 2 — frontend:**
```bash
cd ..   # project root
npx serve .   # or python -m http.server 8080
# site runs at http://localhost:8080 (or 5000 with `npx serve`)
```

Set `window.CHATBOT_BACKEND_URL = 'http://localhost:3000'` temporarily in `index.html`, open the browser, and test the chat.

---

## Editing the system prompt

Open **`chatbot-backend/config/systemPrompt.js`** — the entire prompt is one clearly-commented string. Edit and redeploy:

```bash
cd chatbot-backend
vercel --prod
```

No frontend changes needed.

---

## Where leads go

| Destination | How |
|-------------|-----|
| **Vercel function logs** | Always — every lead is `console.log`'d. View at vercel.com → your project → Functions → Logs |
| **Google Sheet** | When `LEAD_WEBHOOK_URL` is set (recommended) |
| **Email** | Uncomment `MailApp.sendEmail` in the Apps Script |

---

## Swapping the LLM provider

To switch from Gemini to Groq's free tier (or any OpenAI-compatible API):

1. Open `chatbot-backend/api/chat.js`
2. Change the two constants at the top:
   ```javascript
   const LLM_MODEL    = 'llama3-70b-8192';
   const LLM_BASE_URL = 'https://api.groq.com/openai/v1';
   ```
3. Add `GROQ_API_KEY` as an env var and rename the reference in `api/chat.js`
4. Redeploy

The request/response format in `chat.js` will need updating for OpenAI-compatible endpoints (different body shape and SSE parsing) — both are documented inline.

---

## Free-tier limits

| Service | Limit | What happens if exceeded |
|---------|-------|--------------------------|
| Gemini free tier | 15 req/min, 1,500 req/day | Backend returns 429 → widget shows friendly retry message |
| Vercel Hobby | 100 GB bandwidth/month, 100k function invocations/month | Effectively unlimited for a personal consulting site |
| Google Apps Script | 6 min execution/day (well above what's needed) | Lead still logged to Vercel console |

---

## Cost summary

| Component | Cost |
|-----------|------|
| Gemini API (free tier) | $0 — no credit card |
| Vercel Hobby | $0 — no credit card |
| GitHub Pages | $0 |
| Google Apps Script | $0 |
| **Total** | **$0** |
