using System;
using System.Collections.Generic;

namespace CCMS.Agent.Shared
{
    public enum AgentLockState
    {
        Unpaired,
        Locked,
        UnlockedInSession,
        Maintenance
    }

    [Serializable]
    public class CommandEnvelope
    {
        public string version { get; set; } = "1.0";
        public string command_id { get; set; }
        public long sequence_number { get; set; }
        public string device_id { get; set; }
        public string tenant_id { get; set; }
        public string issued_at { get; set; }
        public string expires_at { get; set; }
        public string command_type { get; set; }
        public Dictionary<string, object> payload { get; set; } = new Dictionary<string, object>();
        public string signature { get; set; }
    }

    [Serializable]
    public class AgentLocalState
    {
        public bool IsPaired { get; set; }
        public string DeviceId { get; set; }
        public string DeviceName { get; set; }
        public int? DeviceNumber { get; set; }
        public string TenantId { get; set; }
        public string CafeName { get; set; } = "CCMS Gaming Lounge";
        public string ControllerWsUrl { get; set; }
        public string ControllerApiUrl { get; set; }
        public string AgentToken { get; set; }
        public string ServerPublicKeyPem { get; set; }
        public string ServerPublicKeyFingerprint { get; set; }
        public string AgentPublicKeyBase64 { get; set; }
        public string AgentPrivateKeyBase64 { get; set; }
        public string HardwareFingerprint { get; set; }
        public string OfflinePinSha256Hash { get; set; }
        public long LastSequenceNumber { get; set; }
        public AgentLockState CurrentLockState { get; set; } = AgentLockState.Locked;
        public string ActiveSessionId { get; set; }
        public string SessionType { get; set; }
        public int? RemainingSeconds { get; set; }
        public DateTime LastUpdatedUtc { get; set; } = DateTime.UtcNow;
    }

    [Serializable]
    public class PipeIpcMessage
    {
        public string Action { get; set; } // STATE_SYNC, DISPLAY_MESSAGE, PAIR_REQUEST, EMERGENCY_PIN_UNLOCK
        public AgentLockState LockState { get; set; }
        public string DeviceName { get; set; }
        public int? DeviceNumber { get; set; }
        public string CafeName { get; set; }
        public bool IsConnectedToServer { get; set; }
        public string ActiveSessionId { get; set; }
        public string SessionType { get; set; }
        public int? RemainingSeconds { get; set; }
        public string MessageTitle { get; set; }
        public string MessageBody { get; set; }
        public string MessageSeverity { get; set; }
        public string PairingCode { get; set; }
        public string ServerIp { get; set; }
        public string EmergencyPin { get; set; }
    }
}
