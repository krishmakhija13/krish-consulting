// ============================================================
// /api/lead  —  Lead capture endpoint
// Saves name + email + message to a configured webhook (e.g. Google Apps Script)
// and always logs to console (visible in Vercel function logs).
// ============================================================

const { setCorsHeaders } = require('../lib/cors');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, message } = req.body || {};

  // Validate
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Invalid name' });
  }
  if (!email || !EMAIL_RE.test((email || '').trim())) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Missing message' });
  }

  const lead = {
    name:      name.trim().slice(0, 200),
    email:     email.trim().toLowerCase().slice(0, 200),
    message:   message.trim().slice(0, 1000),
    timestamp: new Date().toISOString(),
    source:    'chatbot',
  };

  // Always log — these appear in Vercel → Functions → Logs
  console.log('LEAD_CAPTURED:', JSON.stringify(lead));

  // Forward to webhook if LEAD_WEBHOOK_URL is set
  // Works with: Google Apps Script, Zapier, Make, Pipedream, Formspree, etc.
  const webhookUrl = process.env.LEAD_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const r = await fetch(webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(lead),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        console.error('[lead] Webhook error:', r.status, body);
      }
    } catch (err) {
      console.error('[lead] Webhook fetch failed:', err.message);
      // Don't return an error — log failure is non-fatal, the lead is already console-logged above
    }
  }

  return res.status(200).json({ success: true });
};
