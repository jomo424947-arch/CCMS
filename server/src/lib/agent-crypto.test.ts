import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateEd25519KeyPair,
  createSignedCommandEnvelope,
  verifyCommandSignature,
  validateCommandEnvelopeSecurity,
  generatePairingCode,
  detectHardwareClone,
  computePublicKeyFingerprint,
} from './agent-crypto';

describe('CCMS Agent Cryptographic & Enforcement Security Suite', () => {
  const keyPair = generateEd25519KeyPair();

  it('generates valid Ed25519 keypairs and deterministic SHA-256 fingerprint', () => {
    assert.ok(keyPair.publicKeyPem.includes('BEGIN PUBLIC KEY'));
    assert.ok(keyPair.privateKeyPem.includes('BEGIN PRIVATE KEY'));
    assert.ok(keyPair.fingerprint.startsWith('SHA256:'));
    assert.equal(keyPair.fingerprint, computePublicKeyFingerprint(keyPair.publicKeyPem));
  });

  it('signs and verifies a valid CommandEnvelope', () => {
    const envelope = createSignedCommandEnvelope({
      sequenceNumber: 1,
      deviceId: 'dev-pc-01',
      tenantId: 'tenant-1',
      commandType: 'SESSION_START_UNLOCK',
      payload: {
        session_id: 'sess-123',
        mode: 'fixed',
        duration_seconds: 3600,
      },
      privateKeyPem: keyPair.privateKeyPem,
    });

    assert.equal(verifyCommandSignature(envelope, keyPair.publicKeyPem), true);
  });

  it('rejects a CommandEnvelope if any payload field or header is tampered with', () => {
    const envelope = createSignedCommandEnvelope({
      sequenceNumber: 2,
      deviceId: 'dev-pc-01',
      tenantId: 'tenant-1',
      commandType: 'SESSION_START_UNLOCK',
      payload: {
        session_id: 'sess-123',
        duration_seconds: 3600,
      },
      privateKeyPem: keyPair.privateKeyPem,
    });

    // Tamper with duration_seconds
    const tamperedPayload = {
      ...envelope,
      payload: {
        ...envelope.payload,
        duration_seconds: 999999,
      },
    };
    assert.equal(verifyCommandSignature(tamperedPayload, keyPair.publicKeyPem), false);

    // Tamper with command_type
    const tamperedType = {
      ...envelope,
      command_type: 'AGENT_UNPAIR_UNLOCK' as const,
    };
    assert.equal(verifyCommandSignature(tamperedType, keyPair.publicKeyPem), false);
  });

  it('enforces replay protection (sequence number monotonicity, expiry window, duplicate ID)', () => {
    const nowMs = 1_700_000_000_000;
    const envelope = createSignedCommandEnvelope({
      commandId: 'cmd-unique-001',
      sequenceNumber: 5,
      deviceId: 'dev-pc-01',
      tenantId: 'tenant-1',
      commandType: 'SESSION_END_LOCK',
      payload: { reason: 'session_ended' },
      ttlSeconds: 30,
      nowMs,
      privateKeyPem: keyPair.privateKeyPem,
    });

    const seenIds = new Set<string>();

    // Valid execution within 30s window and higher sequence number
    const validCheck = validateCommandEnvelopeSecurity({
      envelope,
      lastSequenceNumber: 4,
      expectedDeviceId: 'dev-pc-01',
      publicKeyPem: keyPair.publicKeyPem,
      nowMs: nowMs + 5000,
      seenCommandIds: seenIds,
    });
    assert.equal(validCheck.valid, true);

    // Replay with lower or equal sequence number
    const replaySeqCheck = validateCommandEnvelopeSecurity({
      envelope,
      lastSequenceNumber: 5,
      expectedDeviceId: 'dev-pc-01',
      publicKeyPem: keyPair.publicKeyPem,
      nowMs: nowMs + 5000,
    });
    assert.equal(replaySeqCheck.valid, false);
    assert.equal(replaySeqCheck.reason, 'SEQUENCE_REPLAY_DETECTED');

    // Replay after 30s expiration window
    const expiredCheck = validateCommandEnvelopeSecurity({
      envelope,
      lastSequenceNumber: 4,
      expectedDeviceId: 'dev-pc-01',
      publicKeyPem: keyPair.publicKeyPem,
      nowMs: nowMs + 31_000,
    });
    assert.equal(expiredCheck.valid, false);
    assert.equal(expiredCheck.reason, 'COMMAND_EXPIRED');

    // Wrong target device ID
    const wrongDeviceCheck = validateCommandEnvelopeSecurity({
      envelope,
      lastSequenceNumber: 4,
      expectedDeviceId: 'dev-pc-02',
      publicKeyPem: keyPair.publicKeyPem,
      nowMs: nowMs + 5000,
    });
    assert.equal(wrongDeviceCheck.valid, false);
    assert.equal(wrongDeviceCheck.reason, 'DEVICE_ID_MISMATCH');
  });

  it('generates 6-digit numeric OTP pairing codes', () => {
    for (let i = 0; i < 25; i++) {
      const code = generatePairingCode();
      assert.match(code, /^\d{6}$/);
    }
  });

  it('detects disk cloning and duplicate hardware fingerprints', () => {
    // Normal matching hardware fingerprint
    const clean = detectHardwareClone({
      deviceId: 'dev-1',
      storedFingerprint: 'HW-UUID-AAA-111',
      incomingFingerprint: 'HW-UUID-AAA-111',
      otherDevicesWithSameFingerprint: [],
    });
    assert.equal(clean.isCloneConflict, false);

    // Disk moved/cloned onto different motherboard
    const changedHw = detectHardwareClone({
      deviceId: 'dev-1',
      storedFingerprint: 'HW-UUID-AAA-111',
      incomingFingerprint: 'HW-UUID-BBB-222',
      otherDevicesWithSameFingerprint: [],
    });
    assert.equal(changedHw.isCloneConflict, true);
    assert.equal(changedHw.reason, 'HARDWARE_FINGERPRINT_CHANGED_DISK_CLONE');

    // Two PCs reporting identical hardware fingerprint
    const duplicateAcrossPcs = detectHardwareClone({
      deviceId: 'dev-2',
      storedFingerprint: 'HW-UUID-AAA-111',
      incomingFingerprint: 'HW-UUID-AAA-111',
      otherDevicesWithSameFingerprint: [{ id: 'dev-1', name: 'PC-01' }],
    });
    assert.equal(duplicateAcrossPcs.isCloneConflict, true);
    assert.equal(duplicateAcrossPcs.reason, 'DUPLICATE_HARDWARE_FINGERPRINT_ACROSS_DEVICES');
    assert.deepEqual(duplicateAcrossPcs.conflictingDeviceIds, ['dev-1']);
  });
});
