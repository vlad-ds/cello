import { backendConfig } from '@/config/backend';
import type { DataClient } from './types';
import { sqliteDataClient } from './sqliteClient';
import { supabaseDataClient } from './supabaseClient';

export const dataClient: DataClient = backendConfig.useSupabase
  ? supabaseDataClient
  : sqliteDataClient;

export const isSupabaseBackend = backendConfig.useSupabase;

export * from './types';
