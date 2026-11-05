#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
async function send(state) {
  const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.dsh-pet', 'bridge.json'), 'utf8'));
  const response = await fetch(`http://127.0.0.1:${config.port}/event`, {
    method: 'POST', headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ state, sessionId: 'demo', title: state === 'done' ? 'Demo chat finished responding.' : '', eventId: `demo-${Date.now()}-${state}` }),
    signal: AbortSignal.timeout(2000)
  });
  if (!response.ok) throw new Error(`Pet bridge returned ${response.status}`);
}
(async () => {
  if (process.argv.includes('--demo')) {
    await send('thinking');
    await new Promise(resolve => setTimeout(resolve, 3000));
    await send('done');
  } else await send(process.argv[2] || 'done');
  console.log('Pet notified.');
})().catch(error => { console.error(`Cannot reach pet. Start it with npm start first. ${error.message}`); process.exitCode = 1; });
