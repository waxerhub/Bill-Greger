// claudeAI.js — Anthropic API helpers for Character Forge
// All requests are proxied through /api/messages (server.js) so the API key
// never reaches the browser.

const API_URL = '/api/messages';
const MODEL = 'claude-opus-4-7';

// ── Spell Search (streaming, with extended thinking) ─────────────────────────
// charContext: { cls, level, race, adjSlots, memorized, notes }
// onChunk(text)   — called with each streamed text delta
// onDone(full)    — called when complete
// onThinking(txt) — called with each thinking delta (optional)
export async function streamSpellSearch(query, spellData, charContext, onChunk, onDone, onThinking) {
  var is1e = spellData.length > 0 && spellData[0]._1eClass;
  var edition = is1e ? '1st' : '2nd';

  // Full descriptions — feasible because spellData is pre-filtered to castable spells
  var spellIndex = spellData.map(function(s) {
    var parts = [s['Spell Name'], 'L' + s.Level];
    if (s.Sphere) parts.push('Sphere:' + s.Sphere);
    if (s.School) parts.push('School:' + s.School);
    if (s.Category) parts.push(s.Category);
    if (s.Description) parts.push(s.Description.slice(0, 220));
    if (s['Damage Dice']) parts.push('Dmg:' + s['Damage Dice']);
    return parts.join(' | ');
  }).join('\n');

  // Character context block
  var charBlock = '';
  if (charContext) {
    var slots = (charContext.adjSlots || [])
      .map(function(n, i) { return 'L' + (i + 1) + ':' + n; })
      .filter(function(s) { return !s.endsWith(':0'); })
      .join(', ');
    var prepped = (charContext.memorized || [])
      .map(function(m) { return m['Spell Name'] + ' (L' + m.Level + ')'; })
      .join(', ');
    charBlock =
      'CHARACTER:\n' +
      '  Class: ' + charContext.cls + ' | Level: ' + charContext.level + ' | Race: ' + (charContext.race || '') + '\n' +
      '  Spell slots available: ' + (slots || 'none') + '\n' +
      (prepped ? '  Already memorized: ' + prepped + '\n' : '') +
      (charContext.notes ? '  Notes: ' + charContext.notes.slice(0, 400) + '\n' : '') +
      '\n';
  }

  var systemPrompt =
    'You are a strategic AD&D ' + edition + ' Edition spell advisor with deep tactical knowledge.\n\n' +
    'The player describes a situation or need. You will:\n' +
    '1. Analyze the scenario — identify key tactical challenges and priorities\n' +
    '2. Recommend the best spells from the compendium for THIS character\n' +
    '3. Explain HOW each spell addresses the specific situation\n' +
    '4. Suggest SPELL COMBINATIONS and optimal CASTING ORDER for maximum effect\n' +
    '5. Respect the character\'s available spell slots — note if slots are tight\n' +
    '6. Call out any already-memorized spells that are especially relevant\n' +
    '7. If environment or terrain is described, factor in line-of-sight, cover, and material components\n\n' +
    'Format: lead with a brief tactical assessment, then group recommendations by priority or role.\n' +
    'Write spell names in **bold** using their exact name from the list.\n' +
    'Be specific and decisive — this is live tactical advice.\n\n' +
    charBlock +
    'AVAILABLE SPELLS (Name | Level | Sphere/School | Category | Description | Dmg):\n' +
    spellIndex;

  var response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: 'enabled', budget_tokens: 10000 },
      stream: true,
      system: systemPrompt,
      messages: [{ role: 'user', content: query }],
    }),
  });

  if (!response.ok) {
    var errText = await response.text();
    throw new Error('API ' + response.status + ': ' + errText);
  }

  var reader = response.body.getReader();
  var decoder = new TextDecoder();
  var fullText = '';
  var buffer = '';

  while (true) {
    var chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    var lines = buffer.split('\n');
    buffer = lines.pop();
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.startsWith('data: ')) continue;
      var raw = line.slice(6).trim();
      if (!raw || raw === '[DONE]') continue;
      try {
        var ev = JSON.parse(raw);
        if (ev.type === 'content_block_delta' && ev.delta) {
          if (ev.delta.type === 'thinking_delta' && ev.delta.thinking && onThinking) {
            onThinking(ev.delta.thinking);
          } else if (ev.delta.type === 'text_delta' && ev.delta.text) {
            fullText += ev.delta.text;
            onChunk(ev.delta.text);
          }
        }
      } catch (_) {}
    }
  }
  onDone(fullText);
}

// Extract **bold** spell names from Claude's response
export function extractSpellNames(text) {
  var matches = text.match(/\*\*([^*\n]+)\*\*/g) || [];
  return matches.map(function(m) { return m.slice(2, -2); });
}

// ── Character Generator ──────────────────────────────────────────────────────
export async function generateCharacter(description) {
  var validRaces   = ['Human','Elf','Half-Elf','Dwarf','Gnome','Halfling','Half-Orc'];
  var validClasses = ['Fighter','Ranger','Paladin','Cleric','Druid','Mage','Illusionist','Thief','Bard'];
  var validAligns  = ['Lawful Good','Neutral Good','Chaotic Good','Lawful Neutral','True Neutral','Chaotic Neutral','Lawful Evil','Neutral Evil','Chaotic Evil'];

  var raceCls = 'Human=any; Elf=Fighter/Ranger/Cleric/Mage/Thief; Half-Elf=any; ' +
    'Dwarf=Fighter/Cleric/Thief; Gnome=Fighter/Cleric/Thief/Illusionist; ' +
    'Halfling=Fighter/Cleric/Thief; Half-Orc=Fighter/Cleric/Thief';

  var systemPrompt =
    'You are an AD&D 2nd Edition character creation assistant.\n' +
    'Generate a character based on the user\'s description.\n' +
    'Return ONLY a valid JSON object (no markdown, no code fences, no commentary).\n\n' +
    'Required shape:\n' +
    '{\n' +
    '  "name": string,\n' +
    '  "race": one of ' + JSON.stringify(validRaces) + ',\n' +
    '  "cls": one of ' + JSON.stringify(validClasses) + ',\n' +
    '  "level": integer 1–20,\n' +
    '  "stats": { "Str":int, "Dex":int, "Con":int, "Int":int, "Wis":int, "Cha":int },\n' +
    '  "strPct": 0 (or 1–100 for Warriors with STR 18 exceptional strength),\n' +
    '  "align": one of ' + JSON.stringify(validAligns) + ',\n' +
    '  "hp": integer,\n' +
    '  "notes": string (1-2 sentences, background/personality — no quotes inside the string)\n' +
    '}\n\n' +
    'Rules: stats 3–18 (heroic: 9–18, prime stat ≥ 15). ' + raceCls + '.\n' +
    'Warriors (Fighter/Ranger/Paladin) with STR 18 may set strPct 1–100.\n' +
    'HP should be realistic for class hit die × level + CON bonus.\n' +
    'Return ONLY the JSON object.';

  var response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: 'user', content: description }],
    }),
  });

  if (!response.ok) {
    var errText = await response.text();
    throw new Error('API ' + response.status + ': ' + errText);
  }

  var data = await response.json();
  var textBlock = data.content.find(function(b) { return b.type === 'text'; });
  if (!textBlock) throw new Error('No text block in response');
  var text = textBlock.text;
  text = text.replace(/```(?:json)?\n?/g, '').replace(/```\n?/g, '').trim();
  var start = text.indexOf('{');
  var end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in response');
  text = text.slice(start, end + 1);
  return JSON.parse(text);
}

// ── Spell Suggestions for a Character ───────────────────────────────────────
export async function suggestSpellsForCharacter(charInfo, concept, filteredSpells) {
  var spellIndex = filteredSpells.map(function(s) {
    var parts = [s['Spell Name'], 'L' + s.Level];
    if (s.Sphere) parts.push(s.Sphere);
    if (s.School) parts.push(s.School);
    if (s.Category) parts.push(s.Category);
    return parts.join(' | ');
  }).join('\n');

  var systemPrompt =
    'You are an AD&D 2nd Edition spell advisor.\n' +
    'Given a character concept and their available spells, pick the ones that best fit their theme, role, and playstyle.\n' +
    'Return ONLY a JSON array of exact spell names from the list — no commentary, no code fences.\n' +
    'Pick 8-16 spells spread across castable levels. Prioritise thematic fit over mechanical optimality.\n' +
    'Example output: ["Burning Hands","Fireball","Fire Shield"]';

  var userMsg =
    'Character: ' + charInfo.name + ' (' + charInfo.race + ' ' + charInfo.cls +
    ', Level ' + charInfo.level + ', ' + charInfo.align + ')\n' +
    'Concept: ' + concept + '\n\n' +
    'Available spells:\n' + spellIndex;

  var response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });

  if (!response.ok) {
    var errText = await response.text();
    throw new Error('API ' + response.status + ': ' + errText);
  }

  var data = await response.json();
  var textBlock = data.content.find(function(b) { return b.type === 'text'; });
  if (!textBlock) throw new Error('No text block in response');
  var raw = textBlock.text.replace(/```(?:json)?\n?/g, '').replace(/```\n?/g, '').trim();
  var arrStart = raw.indexOf('[');
  var arrEnd = raw.lastIndexOf(']');
  if (arrStart === -1 || arrEnd === -1) throw new Error('No spell array in response');
  return JSON.parse(raw.slice(arrStart, arrEnd + 1));
}

// ── On-demand Spell Description ──────────────────────────────────────────────
export async function fetchSpellDescription(spell) {
  var context = [];
  if (spell._type)          context.push(spell._type);
  if (spell.Sphere)         context.push('Sphere: ' + spell.Sphere);
  if (spell.School)         context.push('School: ' + spell.School);
  if (spell.Category)       context.push('Category: ' + spell.Category);
  if (spell['Damage Dice']) context.push('Damage: ' + spell['Damage Dice']);

  var response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 180,
      system:
        'You are an AD&D 2nd Edition spell reference. ' +
        'When asked about a spell, give a concise 2-3 sentence description covering: ' +
        'what the spell does, its range and duration, and any key mechanical details. ' +
        'Use AD&D 2e terminology. Be specific — no filler phrases.',
      messages: [{
        role: 'user',
        content: 'Describe the AD&D 2e spell "' + spell['Spell Name'] + '"' +
          (context.length ? ' (' + context.join(', ') + ')' : '') + '.',
      }],
    }),
  });

  if (!response.ok) {
    var errText = await response.text();
    throw new Error('API ' + response.status + ': ' + errText);
  }

  var data = await response.json();
  var textBlock = data.content.find(function(b) { return b.type === 'text'; });
  if (!textBlock) throw new Error('No text block in response');
  return textBlock.text.trim();
}

// ── Magic Item Generator ─────────────────────────────────────────────────────
// Returns { name, type, description, effects: { str,dex,con,int,wis,cha,ac,thac0,dmg,saves,hp } }
export async function generateMagicItem(description) {
  var validTypes = ['Ring','Amulet/Necklace','Bracers/Gloves','Helm/Hat','Cloak/Robe',
                    'Belt','Boots','Weapon','Armor/Shield','Wand/Staff/Rod','Misc'];
  var validDmgTypes = ['Fire','Cold','Electricity','Acid','Poison','Radiant','Necrotic',
                       'Sonic','Force','Psychic','Holy','Unholy','Magic',
                       'Piercing','Slashing','Bludgeoning'];

  var systemPrompt =
    'You are an AD&D 2nd Edition magic item designer.\n' +
    'Create a named magic item based on the user\'s description.\n' +
    'Return ONLY a valid JSON object — no markdown, no code fences, no commentary.\n\n' +
    'Required shape:\n' +
    '{\n' +
    '  "name": string (evocative AD&D-style name),\n' +
    '  "type": one of ' + JSON.stringify(validTypes) + ',\n' +
    '  "description": string (2-3 sentences of flavor text and key powers),\n' +
    '  "effects": {\n' +
    '    "str": int,  "dex": int,  "con": int,  "int": int,  "wis": int,  "cha": int,\n' +
    '    "ac": int,           (positive = AC improves, e.g. Ring of Protection +2 → ac:2)\n' +
    '    "thac0": int,        (positive = THAC0 improves, e.g. Sword +2 → thac0:2)\n' +
    '    "dmg": int,          (flat bonus to damage rolls, e.g. Sword +2 → dmg:2)\n' +
    '    "saves": int,        (positive = saving throws improve)\n' +
    '    "hp": int,           (flat HP bonus while worn)\n' +
    '    "bonusDmgDice": int, (number of extra damage dice, e.g. 2 for 2d8 fire)\n' +
    '    "bonusDmgDie":  int, (die size: 4, 6, 8, 10, 12, or 20)\n' +
    '    "bonusDmgType": string one of ' + JSON.stringify(validDmgTypes) + ' or "" for none\n' +
    '  }\n' +
    '}\n\n' +
    'Guidelines: AD&D 2e magic items are typically +1 to +5. ' +
    'A Ring of Protection +2 → ac:2, saves:2. ' +
    'Gauntlets of Ogre Power → str:4. ' +
    'A Sword +1 with 2d6 fire damage → thac0:1, dmg:1, bonusDmgDice:2, bonusDmgDie:6, bonusDmgType:"Fire". ' +
    'A Sword of Radiant Striking +1 → thac0:1, dmg:1, bonusDmgDice:2, bonusDmgDie:8, bonusDmgType:"Radiant". ' +
    'If no typed damage, set bonusDmgDice:0 and bonusDmgType:"". ' +
    'Cursed items use negative values for stat effects. ' +
    'Return ONLY the JSON object.';

  var response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system: systemPrompt,
      messages: [{ role: 'user', content: description }],
    }),
  });

  if (!response.ok) {
    var errText = await response.text();
    throw new Error('API ' + response.status + ': ' + errText);
  }

  var data = await response.json();
  var textBlock = data.content.find(function(b) { return b.type === 'text'; });
  if (!textBlock) throw new Error('No text block in response');
  var text = textBlock.text.replace(/```(?:json)?\n?/g, '').replace(/```\n?/g, '').trim();
  var start = text.indexOf('{');
  var end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in response');
  var item = JSON.parse(text.slice(start, end + 1));
  // Normalise effects — ensure all keys exist with correct types
  var blank = {str:0,dex:0,con:0,int:0,wis:0,cha:0,ac:0,thac0:0,dmg:0,saves:0,hp:0,
               bonusDmgDice:0,bonusDmgDie:6,bonusDmgType:""};
  item.effects = Object.assign({}, blank, item.effects);
  var intKeys = ['str','dex','con','int','wis','cha','ac','thac0','dmg','saves','hp','bonusDmgDice','bonusDmgDie'];
  intKeys.forEach(function(k){ item.effects[k] = parseInt(item.effects[k])||0; });
  if(typeof item.effects.bonusDmgType !== 'string') item.effects.bonusDmgType = '';
  if(!validDmgTypes.includes(item.effects.bonusDmgType)) item.effects.bonusDmgType = '';
  return item;
}

// ── PDF Character Import ─────────────────────────────────────────────────────
// Reads a base64-encoded PDF via the server proxy and extracts character data.
// Returns a character object matching the app's state shape.
export async function parsePDFCharacter(pdfBase64) {
  var response = await fetch('/api/parse-pdf', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pdfBase64: pdfBase64 }),
  });
  if (!response.ok) {
    var errText = await response.text();
    throw new Error('PDF parse failed: ' + errText);
  }
  return response.json();
}
