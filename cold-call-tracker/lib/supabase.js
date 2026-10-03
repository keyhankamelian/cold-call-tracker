import { createClient } from '@supabase/supabase-js';

let client;

// Lazily created so the build doesn't fail if env vars are missing at build time.
export function getSupabase() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. See README.'
    );
  }
  client = createClient(url, key);
  return client;
}
