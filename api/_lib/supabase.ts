import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null | undefined;

/** Client Supabase avec la clé service (serveur uniquement). Null si non configuré. */
export function supabaseAdmin(): SupabaseClient | null {
  if (admin !== undefined) return admin;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  admin = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return admin;
}
