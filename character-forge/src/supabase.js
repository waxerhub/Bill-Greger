// supabase.js — Supabase client for cloud character storage
// Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
// The anon key is safe to expose in the browser (it's a public read/write key
// restricted to the characters table).
//
// Supabase table setup — run this SQL in your Supabase SQL editor:
//
//   create table characters (
//     id uuid default gen_random_uuid() primary key,
//     name text not null default 'Unnamed',
//     data jsonb not null,
//     updated_at timestamptz default now()
//   );
//   create index on characters (updated_at desc);
//
// Gear library table (shared DM + Player item database):
//
//   create table gear_library (
//     id uuid default gen_random_uuid() primary key,
//     name text not null,
//     type text,
//     description text,
//     effects jsonb default '{}',
//     role text default 'player',   -- 'dm' or 'player'
//     created_at timestamptz default now()
//   );
//   create index on gear_library (role, created_at desc);
//   alter table gear_library enable row level security;
//   create policy "Public read"   on gear_library for select using (true);
//   create policy "Public insert" on gear_library for insert with check (true);
//   create policy "Public delete" on gear_library for delete using (true);

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Returns null if env vars aren't set or invalid — cloud features disabled gracefully.
// Wrapped in try/catch so a bad VITE_SUPABASE_URL never crashes the whole app.
function makeClient() {
  if (!url || !key) return null;
  try {
    // Basic sanity-check: must look like a URL before calling createClient
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return createClient(url, key);
  } catch {
    console.warn('[Character Forge] Supabase init skipped — VITE_SUPABASE_URL is invalid:', url);
    return null;
  }
}
export const supabase = makeClient();

// Save or update a character. Returns the saved record (with id).
// Pass an existing id to update, omit to insert a new row.
export async function saveCharacter(charData, existingId) {
  if (!supabase) throw new Error('Supabase not configured — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env');
  const row = {
    name: charData.charName || 'Unnamed',
    data: charData,
    updated_at: new Date().toISOString(),
  };
  if (existingId) row.id = existingId;

  const { data, error } = await supabase
    .from('characters')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// Load a single character by id.
export async function loadCharacterById(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('characters')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// List all characters stored for this browser (ids tracked in localStorage).
export async function listMyCharacters() {
  if (!supabase) throw new Error('Supabase not configured');
  const ids = getMyIds();
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('characters')
    .select('id, name, updated_at')
    .in('id', ids)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

// ── localStorage ID tracking ─────────────────────────────────────────────────
const LS_KEY = 'cf_character_ids';

export function getMyIds() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}

export function addMyId(id) {
  const ids = getMyIds();
  if (!ids.includes(id)) localStorage.setItem(LS_KEY, JSON.stringify([id, ...ids]));
}

export function removeMyId(id) {
  localStorage.setItem(LS_KEY, JSON.stringify(getMyIds().filter(i => i !== id)));
}

// ── Gear Library (shared DM / Player item database) ──────────────────────────

// Save a gear item to the shared library.
// role: 'dm' | 'player'
export async function saveGearToLibrary(item, role) {
  if (!supabase) throw new Error('Supabase not configured');
  const row = {
    name: item.name || 'Unnamed',
    type: item.type || 'Misc',
    description: item.desc || item.description || '',
    effects: item.effects || {},
    role: role || 'player',
  };
  const { data, error } = await supabase
    .from('gear_library')
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// List all gear items, optionally filtered by role ('dm', 'player', or '' for all).
export async function listGearLibrary(role) {
  if (!supabase) throw new Error('Supabase not configured');
  let query = supabase
    .from('gear_library')
    .select('*')
    .order('created_at', { ascending: false });
  if (role) query = query.eq('role', role);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

// Delete a gear item from the library by id.
export async function deleteGearFromLibrary(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('gear_library').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
