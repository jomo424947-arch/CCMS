import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { CommandEnvelope, DeviceCommandType } from './types';

export interface ServerKeyPair {
  publicKeyPem: string;
  privateKeyPem: string;
  publicKeyBase64: string;
  fingerprint: string;
}

let cachedServerKeys: ServerKeyPair | null = null;

const KEY_FILE_PATH = process.env.CCMS_AGENT_KEYS_PATH || path.join(process.cwd(), 'data', 'controller-ed25519.json');

/**
 * Generates a fresh Ed25519 keypair and returns PEM + raw public key representations.
 */
export function generateEd25519KeyPair(): ServerKeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  const publicKeyBase64 = Buffer.from(spkiDer).toString('base64');
  const fingerprint = computePublicKeyFingerprint(publicKeyPem);

  return {
    publicKeyPem,
    privateKeyPem,
    publicKeyBase64,
    fingerprint,
  };
}

/**
 * Computes a deterministic SHA-256 fingerprint for a public key.
 */
export function computePublicKeyFingerprint(publicKeyPemOrBase64: string): string {
  const hash = crypto.createHash('sha256').update(publicKeyPemOrBase64.trim()).digest('hex');
  return `SHA256:${hash.slice(0, 32)}`;
}

/**
 * Loads or generates the local CCMS Controller Ed25519 keypair.
 */
export function getOrCreateControllerKeyPair(): ServerKeyPair {
  if (cachedServerKeys) return cachedServerKeys;

  try {
    if (fs.existsSync(KEY_FILE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(KEY_FILE_PATH, 'utf-8')) as ServerKeyPair;
      if (raw.publicKeyPem && raw.privateKeyPem) {
        cachedServerKeys = raw;
        return cachedServerKeys;
      }
    }
  } catch {
    // Fallback to generating new keypair
  }

  const pair = generateEd25519KeyPair();
  try {
    const dir = path.dirname(KEY_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(KEY_FILE_PATH, JSON.stringify(pair, null, 2), { mode: 0o600 });
  } catch {
    // Ignore file write errors in restricted test environments
  }

  cachedServerKeys = pair;
  return cachedServerKeys;
}

/**
 * Deterministically serializes the unsigned fields of a CommandEnvelope
 * so that both Node.js and the Windows C# Agent verify the exact same byte sequence.
 */
export function canonicalizeCommandEnvelope(envelope: Omit<CommandEnvelope, 'signature'>): string {
  const orderedPayload = sortObjectKeys(envelope.payload || {});
  return JSON.stringify({
    version: envelope.version,
    command_id: envelope.command_id,
    sequence_number: envelope.sequence_number,
    device_id: envelope.device_id,
    tenant_id: envelope.tenant_id,
    issued_at: envelope.issued_at,
    expires_at: envelope.expires_at,
    command_type: envelope.command_type,
    payload: orderedPayload,
  });
}

function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  const record = obj as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = sortObjectKeys(record[key]);
  }
  return sorted;
}

/**
 * Signs an unsigned CommandEnvelope using Ed25519 private key PEM.
 */
export function signCommandEnvelope(
  unsignedEnvelope: Omit<CommandEnvelope, 'signature'>,
  privateKeyPem?: string
): CommandEnvelope {
  const keyPem = privateKeyPem || getOrCreateControllerKeyPair().privateKeyPem;
  const canonical = canonicalizeCommandEnvelope(unsignedEnvelope);
  const signatureBuffer = crypto.sign(null, Buffer.from(canonical, 'utf-8'), keyPem);
  return {
    ...unsignedEnvelope,
    signature: signatureBuffer.toString('base64'),
  };
}

/**
 * Verifies the Ed25519 signature of a CommandEnvelope against the Controller public key.
 */
export function verifyCommandSignature(
  envelope: CommandEnvelope,
  publicKeyPem?: string
): boolean {
  try {
    const keyPem = publicKeyPem || getOrCreateControllerKeyPair().publicKeyPem;
    const { signature, ...unsigned } = envelope;
    if (!signature) return false;
    const canonical = canonicalizeCommandEnvelope(unsigned);
    return crypto.verify(
      null,
      Buffer.from(canonical, 'utf-8'),
      keyPem,
      Buffer.from(signature, 'base64')
    );
  } catch {
    return false;
  }
}

/**
 * Creates a complete signed CommandEnvelope with replay protection window (default 30 seconds).
 */
export function createSignedCommandEnvelope(params: {
  commandId?: string;
  sequenceNumber: number;
  deviceId: string;
  tenantId: string;
  commandType: DeviceCommandType;
  payload: Record<string, unknown>;
  ttlSeconds?: number;
  nowMs?: number;
  privateKeyPem?: string;
}): CommandEnvelope {
  const now = params.nowMs ?? Date.now();
  const ttlMs = (params.ttlSeconds ?? 30) * 1000;
  const unsigned: Omit<CommandEnvelope, 'signature'> = {
    version: '1.0',
    command_id: params.commandId || crypto.randomUUID(),
    sequence_number: params.sequenceNumber,
    device_id: params.deviceId,
    tenant_id: params.tenantId,
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + ttlMs).toISOString(),
    command_type: params.commandType,
    payload: params.payload,
  };
  return signCommandEnvelope(unsigned, params.privateKeyPem);
}

/**
 * Validates replay protection & sequence monotonic ordering for an incoming or outgoing command envelope.
 */
export function validateCommandEnvelopeSecurity(params: {
  envelope: CommandEnvelope;
  lastSequenceNumber: number;
  expectedDeviceId: string;
  publicKeyPem?: string;
  nowMs?: number;
  seenCommandIds?: Set<string>;
}): { valid: boolean; reason?: string } {
  const { envelope, lastSequenceNumber, expectedDeviceId, publicKeyPem, seenCommandIds } = params;
  const now = params.nowMs ?? Date.now();

  if (envelope.device_id !== expectedDeviceId) {
    return { valid: false, reason: 'DEVICE_ID_MISMATCH' };
  }

  if (seenCommandIds && seenCommandIds.has(envelope.command_id)) {
    return { valid: false, reason: 'DUPLICATE_COMMAND_ID' };
  }

  if (envelope.sequence_number <= lastSequenceNumber) {
    return { valid: false, reason: 'SEQUENCE_REPLAY_DETECTED' };
  }

  const expiresAtMs = new Date(envelope.expires_at).getTime();
  if (Number.isNaN(expiresAtMs) || now > expiresAtMs) {
    return { valid: false, reason: 'COMMAND_EXPIRED' };
  }

  const issuedAtMs = new Date(envelope.issued_at).getTime();
  if (Number.isNaN(issuedAtMs) || issuedAtMs > now + 30_000) {
    return { valid: false, reason: 'INVALID_ISSUED_AT_CLOCK_SKEW' };
  }

  if (!verifyCommandSignature(envelope, publicKeyPem)) {
    return { valid: false, reason: 'INVALID_ED25519_SIGNATURE' };
  }

  return { valid: true };
}

/**
 * Generates a cryptographically random 6-digit numeric OTP pairing code.
 */
export function generatePairingCode(): string {
  const num = crypto.randomInt(100000, 1000000);
  return String(num);
}

/**
 * Generates a secure 256-bit bearer token for an authenticated Windows Agent.
 */
export function generateAgentToken(): string {
  return `ccms_agt_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Pure function to detect Disk Cloning / Hardware Fingerprint conflicts across devices.
 * Returns a conflict report if:
 * 1. The stored hardware_fingerprint on this device does not match the incoming hardware_fingerprint, OR
 * 2. Another active device in the same tenant already claims the same hardware_fingerprint.
 */
export function detectHardwareClone(params: {
  deviceId: string;
  storedFingerprint: string | null | undefined;
  incomingFingerprint: string;
  otherDevicesWithSameFingerprint: Array<{ id: string; name: string }>;
}): { isCloneConflict: boolean; reason?: string; conflictingDeviceIds: string[] } {
  const { storedFingerprint, incomingFingerprint, otherDevicesWithSameFingerprint } = params;

  if (!incomingFingerprint || incomingFingerprint.trim().length < 8) {
    return {
      isCloneConflict: true,
      reason: 'INVALID_HARDWARE_FINGERPRINT',
      conflictingDeviceIds: [],
    };
  }

  if (storedFingerprint && storedFingerprint !== incomingFingerprint) {
    return {
      isCloneConflict: true,
      reason: 'HARDWARE_FINGERPRINT_CHANGED_DISK_CLONE',
      conflictingDeviceIds: [params.deviceId],
    };
  }

  const others = otherDevicesWithSameFingerprint.filter((d) => d.id !== params.deviceId);
  if (others.length > 0) {
    return {
      isCloneConflict: true,
      reason: 'DUPLICATE_HARDWARE_FINGERPRINT_ACROSS_DEVICES',
      conflictingDeviceIds: others.map((d) => d.id),
    };
  }

  return {
    isCloneConflict: false,
    conflictingDeviceIds: [],
  };
}
