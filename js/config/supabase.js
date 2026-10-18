/**
 * config/supabase.js — Supabase project for 👤 계정 (accounts + cloud save). The publishable key is a public client key;
 * all access control is done by Row Level Security (see supabase/schema.sql).
 */
export const SUPABASE = {
  url: 'https://tlfnyxtsftamjkrftpoz.supabase.co',
  key: 'sb_publishable_g6cI_V20s0HG6OLFiZI5Ww_RHuJjFWx',
  // game URL (password reset mail redirect); falls back to the current page when running elsewhere
  site: 'https://hyunjk11.github.io/cart-race/',
  tables: { profiles: 'cart_profiles', progress: 'cart_progress', records: 'cart_records' },
  saveDebounceMs: 4000,
  retryMs: [3000, 10000, 30000, 60000],
  leaderboardSize: 20,
};
