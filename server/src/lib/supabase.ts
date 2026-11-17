import { createClient } from '@supabase/supabase-js';
import { localDb } from './local-db';
import dotenv from 'dotenv';
import path from 'path';
import WebSocket from 'ws';

// Load env variables
dotenv.config({ override: true });
dotenv.config({ path: path.join(__dirname, '.env'), override: true }); // same directory
dotenv.config({ path: path.join(__dirname, '../.env'), override: true }); // parent directory (server/.env or electron/server/.env)
dotenv.config({ path: path.join(__dirname, '../../.env'), override: true }); // server/dist/lib/.env
dotenv.config({ path: path.join(__dirname, '../../../.env'), override: true });

const isOffline = process.env.OFFLINE_MODE === 'true';

const url = process.env.SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

// Initialize the real Supabase client for cloud mode
const cloudClient = url && serviceKey
  ? createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WebSocket as any },
    })
  : null;

/**
 * Dynamically exports either the local SQLite query builder (localDb)
 * or the real Supabase Cloud client depending on the OFFLINE_MODE env variable.
 */
export const supabase = isOffline || !cloudClient
  ? (localDb as any)
  : cloudClient;

export { localDb };
