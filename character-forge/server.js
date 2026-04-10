// server.js — Character Forge backend proxy
// Keeps the Anthropic API key server-side; never exposes it to the browser.
//
// Development:
//   1. Copy .env.example to .env and set ANTHROPIC_API_KEY
//   2. npm run server          (starts this on port 3000)
//   3. npm run dev             (Vite on 5173, proxies /api/* → 3000)
//
// Production:
//   1. npm run build           (creates dist/)
//   2. npm start               (serves dist/ + API proxy on PORT or 3000)

import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

// Load .env automatically in Node 20.6+ (ignored on Render — env vars set in dashboard)
const envPath = new URL('.env', import.meta.url).pathname;
if (existsSync(envPath)) {
  const { readFileSync } = await import('node:fs');
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

app.use(express.json({ limit: '2mb' }));

// ── Anthropic proxy ──────────────────────────────────────────────────────────
app.post('/api/messages', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on the server.' });
  }

  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach Anthropic API: ' + err.message });
  }

  if (req.body.stream) {
    // Stream SSE straight through to the browser
    res.setHeader('content-type', 'text/event-stream');
    res.setHeader('cache-control', 'no-cache');
    res.setHeader('connection', 'keep-alive');
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
    } finally {
      res.end();
    }
  } else {
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  }
});

// ── Serve built frontend in production ──────────────────────────────────────
const distDir = join(__dirname, 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => res.sendFile(join(distDir, 'index.html')));
} else {
  app.get('/', (_req, res) =>
    res.send('Run <code>npm run build</code> first, then restart the server.')
  );
}

app.listen(PORT, () => {
  console.log(`Character Forge server running on http://localhost:${PORT}`);
});
