import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Null tant que Supabase n'est pas configuré : l'application reste utilisable sans compte. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
