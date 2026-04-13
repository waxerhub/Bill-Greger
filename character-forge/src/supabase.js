// supabase.js — Supabase client, auth, and cloud storage for Character Forge
// Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
//
// ── Database setup ───────────────────────────────────────────────────────────
// Run the following SQL in your Supabase SQL editor once:
//
//   -- Enable email auth under Authentication → Providers in the dashboard.
//
//   -- Characters table:
//   create table characters (
//     id uuid default gen_random_uuid() primary key,
//     user_id uuid references auth.users(id) on delete cascade,
//     name text not null default 'Unnamed',
//     data jsonb not null,
//     updated_at timestamptz default now()
//   );
//   create index on characters (user_id, updated_at desc);
//   alter table characters enable row level security;
//   create policy "Users see own" on characters
//     for select using (auth.uid() = user_id);
//   create policy "Users insert own" on characters
//     for insert with check (auth.uid() = user_id);
//   create policy "Users update own" on characters
//     for update using (auth.uid() = user_id);
//   create policy "Users delete own" on characters
//     for delete using (auth.uid() = user_id);
//
//   -- If upgrading an existing characters table (no user_id yet):
//   alter table characters
//     add column if not exists user_id uuid references auth.users(id) on delete cascade;
//   create index if not exists on characters (user_id, updated_at desc);
//   -- then enable RLS + create the four policies above.
//
//   -- Gear library table:
//   create table gear_library (
//     id uuid default gen_random_uuid() primary key,
//     name text not null,
//     type text,
//     description text,
//     effects jsonb default '{}',
//     role text default 'player',   -- 'player', 'dm', or '_config' (internal)
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

function makeClient() {
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return createClient(url, key);
  } catch {
    console.warn('[Character Forge] Supabase init skipped — VITE_SUPABASE_URL is invalid:', url);
    return null;
  }
}
export const supabase = makeClient();

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function signUp(email, password) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  return data.user;
}

export async function signIn(email, password) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data.user;
}

export async function signOut() {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

// Subscribe to auth state changes. Returns an unsubscribe function.
export function onAuthStateChange(callback) {
  if (!supabase) return () => {};
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
  return () => subscription.unsubscribe();
}

// ── Characters ───────────────────────────────────────────────────────────────

// Save or update a character for the currently signed-in user.
// Pass existingId to update an existing row; omit to insert a new one.
export async function saveCharacter(charData, existingId) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to save characters to the cloud');

  const row = {
    user_id: user.id,
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

// Load a single character by id (user must own it — enforced by RLS).
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

// List all characters belonging to the signed-in user.
export async function listMyCharacters() {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('characters')
    .select('id, name, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

// ── Gear Library (shared cloud item database) ─────────────────────────────────

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

// List gear items. Pass role='dm' to get only DM items, or omit/'' for all
// non-config items.
export async function listGearLibrary(role) {
  if (!supabase) throw new Error('Supabase not configured');
  let query = supabase
    .from('gear_library')
    .select('*')
    .order('created_at', { ascending: false });
  if (role) query = query.eq('role', role);
  else query = query.neq('role', '_config');
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteGearFromLibrary(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('gear_library').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── DM Password (SHA-256 hash stored as a _config row) ────────────────────────

export async function getDmPasswordHash() {
  if (!supabase) throw new Error('Supabase not configured');
  const { data } = await supabase
    .from('gear_library')
    .select('description')
    .eq('role', '_config')
    .eq('name', 'dm_password')
    .maybeSingle();
  return data ? data.description : null;
}

export async function setDmPasswordHash(hash) {
  if (!supabase) throw new Error('Supabase not configured');
  await supabase.from('gear_library').delete()
    .eq('role', '_config').eq('name', 'dm_password');
  if (hash) {
    const { error } = await supabase.from('gear_library')
      .insert({ name: 'dm_password', role: '_config', description: hash });
    if (error) throw new Error(error.message);
  }
}
