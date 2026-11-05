const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');
function createBridge({ token, onEvent, port = 47831 }) {
  const server = http.createServer(async (req, res) => {
    const reply = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    // No browser callers, CORS, or unauthenticated events. Bind loopback only.
    if (req.headers.origin) return reply(403, { error: 'Browser origins not allowed' });
    const auth = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return reply(401, { error: 'Unauthorized' });
    if (req.method !== 'POST' || req.url !== '/event') return reply(404, { error: 'Not found' });
    try {
      let body = ''; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 8192) { reply(413, { error: 'Event too large' }); return; } body += chunk; }
      const event = JSON.parse(body);
      onEvent(event);
      reply(200, { ok: true });
    } catch { reply(400, { error: 'Invalid event' }); }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.listen(port, '127.0.0.1');
  return server;
}
module.exports = { createBridge };
