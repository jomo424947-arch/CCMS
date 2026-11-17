using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
using CCMS.Agent.Shared;

namespace CCMS.Agent.Service
{
    /// <summary>
    /// Persists AgentLocalState inside C:\ProgramData\CCMS-Agent\state.dat
    /// encrypted with Windows DPAPI (DataProtectionScope.LocalMachine) so local players
    /// cannot read or tamper with the agent token or lock state.
    /// </summary>
    public static class DpapiStateStore
    {
        private static readonly string StateDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "CCMS-Agent");

        private static readonly string StateFilePath = Path.Combine(StateDir, "state.dat");
        private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("CCMS-AGENT-DPAPI-V1");
        private static readonly JavaScriptSerializer Serializer = new JavaScriptSerializer();

        public static AgentLocalState Load()
        {
            try
            {
                if (!File.Exists(StateFilePath))
                {
                    return CreateDefaultState();
                }

                byte[] encrypted = File.ReadAllBytes(StateFilePath);
                byte[] plain = ProtectedData.Unprotect(encrypted, Entropy, DataProtectionScope.LocalMachine);
                string json = Encoding.UTF8.GetString(plain);
                var state = Serializer.Deserialize<AgentLocalState>(json);
                return state ?? CreateDefaultState();
            }
            catch
            {
                return CreateDefaultState();
            }
        }

        public static void Save(AgentLocalState state)
        {
            if (!Directory.Exists(StateDir))
            {
                Directory.CreateDirectory(StateDir);
            }

            state.LastUpdatedUtc = DateTime.UtcNow;
            string json = Serializer.Serialize(state);
            byte[] plain = Encoding.UTF8.GetBytes(json);
            byte[] encrypted = ProtectedData.Protect(plain, Entropy, DataProtectionScope.LocalMachine);
            File.WriteAllBytes(StateFilePath, encrypted);
        }

        private static AgentLocalState CreateDefaultState()
        {
            return new AgentLocalState
            {
                IsPaired = false,
                DeviceName = Environment.MachineName,
                HardwareFingerprint = HardwareFingerprint.Compute(),
                CurrentLockState = AgentLockState.Unpaired,
                OfflinePinSha256Hash = CryptoHelper.ComputeSha256Hex("999999")
            };
        }
    }
}
