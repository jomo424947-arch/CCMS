import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import WebSocket from 'ws';

// Load env variables
dotenv.config({ override: true });
dotenv.config({ path: path.join(__dirname, '.env'), override: true }); // same directory
dotenv.config({ path: path.join(__dirname, '../.env'), override: true }); // parent directory (server/.env or electron/server/.env)
dotenv.config({ path: path.join(__dirname, '../../.env'), override: true }); // server/dist/lib/.env
dotenv.config({ path: path.join(__dirname, '../../../.env'), override: true });

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const cloudSupabase: SupabaseClient | null = url && serviceKey
  ? createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WebSocket as any },
    })
  : null;

if (!cloudSupabase) {
  console.warn(
    '[sync] Supabase cloud credentials not set. Sync engine will run in offline-only mode.'
  );
}
