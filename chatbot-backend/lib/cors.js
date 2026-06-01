// Shared CORS helper for all API routes
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '';
  const allowedRaw = process.env.ALLOWED_ORIGINS || '';
  const allowed = allowedRaw.split(',').map(s => s.trim()).filter(Boolean);

  if (allowed.length === 0) {
    // No restriction configured — allow all (safe for a read-only API that requires a server-side key)
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    // Origin not in list — still set the first allowed origin so the browser sees the correct header
    res.setHeader('Access-Control-Allow-Origin', allowed[0]);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = { setCorsHeaders };
