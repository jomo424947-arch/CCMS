import dgram from 'dgram';
import os from 'os';
import crypto from 'crypto';
import { getOrCreateControllerKeyPair } from './agent-crypto';
import { getActiveTenantConfig } from './database';

const UDP_DISCOVERY_PORT = Number(process.env.CCMS_UDP_DISCOVERY_PORT || 5001);

let udpSocket: dgram.Socket | null = null;

function getPrimaryLanIp(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

export function getControllerDiscoveryMetadata(httpPort = 5000) {
  const keys = getOrCreateControllerKeyPair();
  const tenant = getActiveTenantConfig();
  const ip = getPrimaryLanIp();

  const payload = {
    type: 'CCMS_CONTROLLER_ANNOUNCE_V1',
    controller_ip: ip,
    ws_url: `ws://${ip}:${httpPort}/ws/agent`,
    api_url: `http://${ip}:${httpPort}/api/agent`,
    tenant_id: tenant?.tenant_id || 'local-default',
    cafe_name: tenant?.tenant_name || 'CCMS Gaming Lounge',
    server_public_key: keys.publicKeyPem,
    server_public_key_fingerprint: keys.fingerprint,
  };

  const canonical = JSON.stringify(payload);
  const signature = crypto
    .sign(null, Buffer.from(canonical, 'utf-8'), keys.privateKeyPem)
    .toString('base64');

  return {
    ...payload,
    signature,
  };
}

export function startUdpDiscoveryServer(httpPort = 5000): void {
  if (udpSocket || process.env.NODE_ENV === 'test') return;

  try {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    socket.on('error', (err) => {
      console.warn(`[UDP Discovery] Warning: Could not bind UDP port ${UDP_DISCOVERY_PORT}:`, err.message);
      try {
        socket.close();
      } catch {
        // ignore
      }
      udpSocket = null;
    });

    socket.on('message', (msg, rinfo) => {
      try {
        const parsed = JSON.parse(msg.toString('utf-8'));
        if (parsed && parsed.type === 'CCMS_DISCOVER_V1') {
          const response = getControllerDiscoveryMetadata(httpPort);
          const buf = Buffer.from(JSON.stringify(response), 'utf-8');
          socket.send(buf, rinfo.port, rinfo.address);
        }
      } catch {
        // Ignore malformed UDP packets on LAN
      }
    });

    socket.bind(UDP_DISCOVERY_PORT, () => {
      try {
        socket.setBroadcast(true);
        console.log(`📡 CCMS Agent UDP Discovery Responder listening on port ${UDP_DISCOVERY_PORT}`);
      } catch {
        // ignore
      }
    });

    udpSocket = socket;
  } catch (err: any) {
    console.warn('[UDP Discovery] Failed to initialize:', err?.message);
  }
}

export function stopUdpDiscoveryServer(): void {
  if (udpSocket) {
    try {
      udpSocket.close();
    } catch {
      // ignore
    }
    udpSocket = null;
  }
}
