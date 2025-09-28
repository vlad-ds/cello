const flag = import.meta.env.VITE_USE_SUPABASE?.toString().toLowerCase();

export const backendConfig = {
  useSupabase: flag === 'true' || flag === '1',
  sqliteApiBaseUrl: import.meta.env.VITE_SQLITE_API_URL || 'http://localhost:4000'
} as const;
