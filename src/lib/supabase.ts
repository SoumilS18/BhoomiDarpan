import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Runtime config injected by the server into index.html at serve-time.
// This lets the app work on Docker/Render even when VITE_* vars were not
// available at build time (which is the standard Render Docker deployment flow).
declare global {
  interface Window {
    __BHOOMISETU__?: {
      SUPABASE_URL?: string;
      SUPABASE_ANON_KEY?: string;
      MAPTILER_API_KEY?: string;
    };
  }
}

const runtimeCfg = typeof window !== 'undefined' ? (window.__BHOOMISETU__ ?? {}) : {};

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string) ||
  runtimeCfg.SUPABASE_URL ||
  '';

const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ||
  runtimeCfg.SUPABASE_ANON_KEY ||
  '';

export const isClientSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseUrl !== 'https://your-supabase-project.supabase.co' &&
  supabaseAnonKey &&
  supabaseAnonKey !== 'your-supabase-anon-key'
);

export const supabase: SupabaseClient | null = isClientSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
