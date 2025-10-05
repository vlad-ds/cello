import type { DataClient } from './types';
import { sqliteDataClient } from './sqliteClient';

export const dataClient: DataClient = sqliteDataClient;

export * from './types';
