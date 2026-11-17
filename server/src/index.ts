import dotenv from 'dotenv';
import path from 'path';

// Load env variables from multiple locations to handle different execution cwd environments
dotenv.config(); // CWD
dotenv.config({ path: path.join(__dirname, '.env') }); // same directory (for packaged Electron)
dotenv.config({ path: path.join(__dirname, '../.env') }); // server/.env
dotenv.config({ path: path.join(__dirname, '../../.env') }); // workspace root/.env

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'fs';

import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.routes';
import deviceRoutes from './routes/devices.routes';
import sessionRoutes from './routes/sessions.routes';
import billingRoutes from './routes/billing.routes';
import reservationRoutes from './routes/reservations.routes';
import reportRoutes from './routes/reports.routes';
import customerRoutes from './routes/customers.routes';
import productRoutes from './routes/products.routes';
import pricingRoutes from './routes/pricing.routes';
import employeeRoutes from './routes/employees.routes';
import roomRoutes from './routes/rooms.routes';
import cafeTableRoutes from './routes/cafe-tables.routes';
import shiftRoutes from './routes/shifts.routes';
import monthlyClosingsRoutes from './routes/monthly-closings.routes';
import agentRoutes from './routes/agent.routes';
import { errorHandler, notFoundHandler } from './middleware/error';
import { supabase } from './lib/supabase';
import { csrfProtection } from './middleware/csrf';
import { initDatabase, startAutoSave, getDb, setActiveTenantConfig, saveDatabase } from './lib/database';
import { hashPassword } from './lib/local-auth';
import { startSyncEngine } from './lib/sync-engine';
import { licenseCheck } from './middleware/license';
import { agentControlService, sqlQueryOne } from './lib/agent-control.service';
import { startUdpDiscoveryServer } from './lib/udp-discovery';
import crypto from 'crypto';

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.CCMS_PORT || (process.env.PORT && process.env.PORT !== '8080' && process.env.PORT !== '3000' ? process.env.PORT : 5000);
const origin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const allowedOrigins = [origin, 'http://localhost:5173', 'http://localhost:3000', 'http://localhost:5000', 'file://', 'null'];

// General API Rate Limiting to prevent DOS/brute-force
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000,
  message: {
    error: {
      message: 'Too many requests from this IP, please try again later.',
      code: 'TOO_MANY_REQUESTS'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 login attempts per 15 minutes
  message: {
    error: {
      message: 'Too many authentication attempts, please try again later.',
      code: 'TOO_MANY_LOGIN_REQUESTS'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false, // Prevents untrustworthy origin errors on HTTP/IP deployments
  originAgentCluster: false, // Prevents origin-keyed agent cluster errors on IP deployments
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: false, // Disable HSTS for HTTP / direct IP deployments
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "http:", "https:", "ws:", "wss:", "*"],
      upgradeInsecureRequests: null,
    },
  },
}));
app.use(cors({
  origin: (requestOrigin, callback) => {
    // Dynamically allow requests from any client IP (mobile, tablet, desktop, electron, LAN, remote VPS)
    callback(null, true);
  },
  credentials: true,
}));
app.use(cookieParser());
app.use(csrfProtection);
app.use(express.json());
app.use('/api/auth/login', authLimiter);
app.use(apiLimiter);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(licenseCheck);

// Health check.
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ccms-api' }));

// API route groups.
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/invoices', billingRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/cafe-tables', cafeTableRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/financial-closings', monthlyClosingsRoutes);
app.use('/api/agent', agentRoutes);

// Serve Static Frontend if compiled client/dist exists
const possibleDistPaths = [
  path.resolve(__dirname, '../../client/dist'),
  path.resolve(__dirname, '../../dist'),
  path.resolve(__dirname, '../dist'),
  path.resolve(__dirname, '../../../dist'),
  path.resolve(__dirname, '../../../client/dist'),
];
const clientDistPath = possibleDistPaths.find((p) => fs.existsSync(p));

if (clientDistPath) {
  console.log(`[server] Serving static client files from: ${clientDistPath}`);
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    } else {
      next();
    }
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

async function ensureInitialDemoSeed() {
  try {
    const existingDemoAdmin = sqlQueryOne<{ id: string }>(
      "SELECT id FROM users WHERE email = 'admin@ccms.local' LIMIT 1"
    );
    if (existingDemoAdmin) {
      // Also restart simulated agents for any devices that were already paired in demo
      const managedDevices = getDb().exec("SELECT id, tenant_id FROM devices WHERE is_managed = 1 AND agent_status != 'unpaired' AND archived = 0");
      if (managedDevices[0]?.values) {
        for (const row of managedDevices[0].values) {
          agentControlService.startSimulatedAgent(String(row[0]), String(row[1]));
        }
      }
      return;
    }

    const tenantId = '00000000-0000-4000-8000-000000000001';
    const adminId = '00000000-0000-4000-8000-000000000010';
    const nowIso = new Date().toISOString();
    const futureExpiry = new Date(Date.now() + 365 * 86_400_000).toISOString();

    setActiveTenantConfig({
      tenant_id: tenantId,
      tenant_name: 'CCMS Esports Arena',
      owner_email: 'admin@ccms.local',
      status: 'active',
      plan: 'annual_full',
      expires_at: futureExpiry,
    });

    const passwordHash = await hashPassword('admin123');
    const db = getDb();

    db.run(
      `INSERT OR IGNORE INTO users (id, email, full_name, role, password_hash, tenant_id, created_at, updated_at, synced)
       VALUES (?, ?, ?, 'admin', ?, ?, ?, ?, 1)`,
      [adminId, 'admin@ccms.local', 'Arena Admin', passwordHash, tenantId, nowIso, nowIso]
    );

    // Open an active shift so sessions can be started immediately
    db.run(
      `INSERT OR IGNORE INTO shifts (id, user_id, tenant_id, started_at, opening_cash, total_revenue, total_expenses, status, created_at, synced)
       VALUES (?, ?, ?, ?, 500, 0, 0, 'active', ?, 1)`,
      ['00000000-0000-4000-8000-000000000050', adminId, tenantId, nowIso, nowIso]
    );

    // Seed sample devices: 2 managed PCs (online_locked), 1 unmanaged PC (unpaired), 1 PS5 console
    const pc1Id = '00000000-0000-4000-8000-000000000101';
    const pc2Id = '00000000-0000-4000-8000-000000000102';
    const pc3Id = '00000000-0000-4000-8000-000000000103';
    const ps5Id = '00000000-0000-4000-8000-000000000201';

    db.run(
      `INSERT OR IGNORE INTO devices (id, name, type, status, specs, hourly_rate, hourly_rate_multi, archived, is_managed, device_number, agent_status, tenant_id, created_at, updated_at)
       VALUES (?, 'PC-01 (RTX 4070)', 'pc', 'available', ?, 40, 40, 0, 1, 1, 'online_locked', ?, ?, ?)`,
      [pc1Id, JSON.stringify({ gpu: 'RTX 4070', ram: '32GB', monitor: '240Hz' }), tenantId, nowIso, nowIso]
    );

    db.run(
      `INSERT OR IGNORE INTO devices (id, name, type, status, specs, hourly_rate, hourly_rate_multi, archived, is_managed, device_number, agent_status, tenant_id, created_at, updated_at)
       VALUES (?, 'PC-02 (RTX 4070)', 'pc', 'available', ?, 40, 40, 0, 1, 2, 'online_locked', ?, ?, ?)`,
      [pc2Id, JSON.stringify({ gpu: 'RTX 4070', ram: '32GB', monitor: '240Hz' }), tenantId, nowIso, nowIso]
    );

    db.run(
      `INSERT OR IGNORE INTO devices (id, name, type, status, specs, hourly_rate, hourly_rate_multi, archived, is_managed, device_number, agent_status, tenant_id, created_at, updated_at)
       VALUES (?, 'PC-03 (RTX 4060)', 'pc', 'available', ?, 35, 35, 0, 1, 3, 'unpaired', ?, ?, ?)`,
      [pc3Id, JSON.stringify({ gpu: 'RTX 4060', ram: '16GB', monitor: '165Hz' }), tenantId, nowIso, nowIso]
    );

    db.run(
      `INSERT OR IGNORE INTO devices (id, name, type, status, specs, hourly_rate, hourly_rate_multi, archived, is_managed, device_number, agent_status, tenant_id, created_at, updated_at)
       VALUES (?, 'PS5 Lounge 01', 'console', 'available', ?, 60, 90, 0, 0, null, 'unpaired', ?, ?, ?)`,
      [ps5Id, JSON.stringify({ controllers: 4, display: '65" 4K OLED' }), tenantId, nowIso, nowIso]
    );

    saveDatabase();

    // Start live simulated Windows Agents for PC-01 and PC-02
    agentControlService.startSimulatedAgent(pc1Id, tenantId);
    agentControlService.startSimulatedAgent(pc2Id, tenantId);
    console.log('✓ Seeded initial CCMS Esports Arena demo (admin@ccms.local / admin123) with Live Simulated Windows Agents on PC-01 & PC-02');
  } catch (seedErr: any) {
    console.warn('[server] Demo seed check warning:', seedErr?.message || seedErr);
  }
}

async function startServer() {
  // Initialize offline SQLite DB
  await initDatabase();
  await ensureInitialDemoSeed();
  startAutoSave(5000); // Save to disk every 5 seconds
  startSyncEngine(60000); // Run background Sync Engine every 60 seconds (1 minute)

  const server = app.listen(PORT, () => {
    console.log(`\n  ⬡ CCMS Offline API running → http://localhost:${PORT}`);
    console.log(`  CORS origin → ${origin}\n`);
  });

  // Attach CCMS Device Control Plane WebSockets (/ws/agent & /ws/dashboard) and UDP Discovery
  agentControlService.init(server);
  startUdpDiscoveryServer(Number(PORT));

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[server] Port ${PORT} already in use. Retaining existing service.`);
    } else {
      console.error('[server] HTTP server error:', err);
    }
  });
}

startServer().catch((err) => {
  const errorDetails = err?.stack || err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
  console.error('[server] Failed to start:', errorDetails);
  if (!process.versions || !process.versions.electron) {
    process.exit(1);
  }
});

