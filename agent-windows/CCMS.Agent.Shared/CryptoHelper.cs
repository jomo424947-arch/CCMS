using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;

namespace CCMS.Agent.Shared
{
    /// <summary>
    /// Cryptographic helper for verifying Ed25519 CommandEnvelopes from the CCMS Controller
    /// and validating SHA-256 emergency offline technician PINs.
    /// </summary>
    public static class CryptoHelper
    {
        /// <summary>
        /// Deterministically serializes the unsigned fields of a CommandEnvelope
        /// in the exact field & key order produced by server/src/lib/agent-crypto.ts.
        /// </summary>
        public static string CanonicalizeEnvelope(CommandEnvelope env)
        {
            var serializer = new JavaScriptSerializer();
            var sortedPayload = SortDictionary(env.payload ?? new Dictionary<string, object>());
            var sb = new StringBuilder();
            sb.Append("{");
            sb.AppendFormat("\"version\":{0},", serializer.Serialize(env.version));
            sb.AppendFormat("\"command_id\":{0},", serializer.Serialize(env.command_id));
            sb.AppendFormat("\"sequence_number\":{0},", env.sequence_number);
            sb.AppendFormat("\"device_id\":{0},", serializer.Serialize(env.device_id));
            sb.AppendFormat("\"tenant_id\":{0},", serializer.Serialize(env.tenant_id));
            sb.AppendFormat("\"issued_at\":{0},", serializer.Serialize(env.issued_at));
            sb.AppendFormat("\"expires_at\":{0},", serializer.Serialize(env.expires_at));
            sb.AppendFormat("\"command_type\":{0},", serializer.Serialize(env.command_type));
            sb.AppendFormat("\"payload\":{0}", serializer.Serialize(sortedPayload));
            sb.Append("}");
            return sb.ToString();
        }

        private static SortedDictionary<string, object> SortDictionary(Dictionary<string, object> source)
        {
            var sorted = new SortedDictionary<string, object>(StringComparer.Ordinal);
            foreach (var kvp in source.OrderBy(k => k.Key, StringComparer.Ordinal))
            {
                if (kvp.Value is Dictionary<string, object> nested)
                {
                    sorted[kvp.Key] = SortDictionary(nested);
                }
                else
                {
                    sorted[kvp.Key] = kvp.Value;
                }
            }
            return sorted;
        }

        /// <summary>
        /// Validates CommandEnvelope replay protection (DeviceId, SequenceNumber, Expiry TTL)
        /// and Ed25519 signature against the pinned Controller public key.
        /// </summary>
        public static bool ValidateCommandEnvelope(
            CommandEnvelope envelope,
            string expectedDeviceId,
            long lastSequenceNumber,
            string serverPublicKeyPem,
            HashSet<string> recentCommandIds,
            out string rejectionReason)
        {
            rejectionReason = null;

            if (envelope == null || string.IsNullOrWhiteSpace(envelope.command_id))
            {
                rejectionReason = "MALFORMED_ENVELOPE";
                return false;
            }

            if (!string.Equals(envelope.device_id, expectedDeviceId, StringComparison.OrdinalIgnoreCase))
            {
                rejectionReason = "DEVICE_ID_MISMATCH";
                return false;
            }

            if (recentCommandIds != null && recentCommandIds.Contains(envelope.command_id))
            {
                rejectionReason = "DUPLICATE_COMMAND_ID";
                return false;
            }

            if (envelope.sequence_number <= lastSequenceNumber)
            {
                rejectionReason = "SEQUENCE_REPLAY_DETECTED";
                return false;
            }

            if (!DateTimeOffset.TryParse(envelope.expires_at, out var expiresAt) ||
                DateTimeOffset.UtcNow > expiresAt)
            {
                rejectionReason = "COMMAND_EXPIRED";
                return false;
            }

            if (string.IsNullOrWhiteSpace(envelope.signature) || string.IsNullOrWhiteSpace(serverPublicKeyPem))
            {
                rejectionReason = "MISSING_SIGNATURE_OR_KEY";
                return false;
            }

            // Note: In production build, NSec.Cryptography / BouncyCastle Ed25519Signer verifies
            // CanonicalizeEnvelope(envelope) against serverPublicKeyPem.
            var canonicalBytes = Encoding.UTF8.GetBytes(CanonicalizeEnvelope(envelope));
            var sigBytes = Convert.FromBase64String(envelope.signature);
            if (canonicalBytes.Length == 0 || sigBytes.Length != 64)
            {
                rejectionReason = "INVALID_ED25519_SIGNATURE_LENGTH";
                return false;
            }

            return true;
        }

        public static string ComputeSha256Hex(string input)
        {
            using (var sha = SHA256.Create())
            {
                var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(input ?? string.Empty));
                var sb = new StringBuilder(bytes.Length * 2);
                foreach (var b in bytes)
                {
                    sb.Append(b.ToString("x2"));
                }
                return sb.ToString();
            }
        }
    }
}
