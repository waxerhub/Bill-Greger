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

// ── PDF → Character parser ───────────────────────────────────────────────────
app.post('/api/parse-pdf', async (req, res) => {
  const { pdfBase64 } = req.body;
  if (!pdfBase64) return res.status(400).json({ error: 'No PDF data provided' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set on server' });

  const systemPrompt =
    'You are an AD&D 2nd Edition character sheet parser.\n' +
    'Read the provided character sheet PDF and extract all character data.\n' +
    'Return ONLY a valid JSON object — no markdown, no code fences.\n\n' +
    'Required shape:\n' +
    '{\n' +
    '  "charName": string,\n' +
    '  "race": string (Human/Elf/Half-Elf/Dwarf/Gnome/Halfling/Half-Orc),\n' +
    '  "cls": string (Fighter/Ranger/Paladin/Cleric/Druid/Mage/Illusionist/Thief/Bard),\n' +
    '  "kit": string (or ""),\n' +
    '  "level": integer,\n' +
    '  "hp": integer,\n' +
    '  "align": string,\n' +
    '  "stats": { "Str":int, "Dex":int, "Con":int, "Int":int, "Wis":int, "Cha":int },\n' +
    '  "strPct": integer (0 unless exceptional STR shown),\n' +
    '  "notes": string\n' +
    '}\n' +
    'If a field is not visible on the sheet, use a sensible default (0 for numbers, "" for strings).\n' +
    'Return ONLY the JSON object.';

  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
        max_tokens: 1200,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
            },
            { type: 'text', text: 'Extract the character data from this sheet as JSON.' },
          ],
        }],
      }),
    });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach Anthropic API: ' + err.message });
  }

  const apiData = await upstream.json();
  if (!upstream.ok) return res.status(upstream.status).json(apiData);

  const textBlock = apiData.content.find(b => b.type === 'text');
  if (!textBlock) return res.status(500).json({ error: 'No text in API response' });

  let text = textBlock.text.replace(/```(?:json)?\n?/g, '').replace(/```\n?/g, '').trim();
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return res.status(500).json({ error: 'No JSON found in response' });

  try {
    res.json(JSON.parse(text.slice(start, end + 1)));
  } catch (e) {
    res.status(500).json({ error: 'Failed to parse JSON: ' + e.message });
  }
});

// ── Portrait generation proxy (Pollinations.ai) ─────────────────────────────
app.post('/api/generate-portrait', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

  const seed = Math.floor(Math.random() * 1_000_000);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&model=flux&nologo=true&seed=${seed}`;

  let upstream;
  try {
    upstream = await fetch(url, { signal: AbortSignal.timeout(55000) });
  } catch (err) {
    return res.status(502).json({ error: 'Image API unreachable: ' + err.message });
  }

  if (!upstream.ok) return res.status(502).json({ error: 'Image API returned ' + upstream.status });

  const buffer = await upstream.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const contentType = upstream.headers.get('content-type') || 'image/jpeg';
  res.json({ dataUrl: `data:${contentType};base64,${base64}` });
});

// ── Admin: set user password (requires service role key in env) ──────────────
app.post('/api/admin/set-password', async (req, res) => {
  const { email, password, adminKey } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) return res.status(500).json({ error: 'Supabase admin not configured on server' });

  // Simple guard: caller must supply the service role key as adminKey
  if (adminKey !== serviceKey) return res.status(403).json({ error: 'Unauthorized' });

  try {
    // 1. Find the user by email
    const listRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    const listData = await listRes.json();
    if (!listRes.ok) return res.status(listRes.status).json({ error: listData.message || 'Failed to list users' });

    const user = (listData.users || []).find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) return res.status(404).json({ error: `No user found with email ${email}` });

    // 2. Update their password
    const updateRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
      method: 'PUT',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const updateData = await updateRes.json();
    if (!updateRes.ok) return res.status(updateRes.status).json({ error: updateData.message || 'Failed to update password' });

    res.json({ success: true, email: updateData.email });
  } catch (err) {
    res.status(502).json({ error: err.message });
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
