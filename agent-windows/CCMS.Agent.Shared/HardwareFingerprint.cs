using System;
using System.Management;

namespace CCMS.Agent.Shared
{
    /// <summary>
    /// Computes a deterministic Hardware Fingerprint from SMBIOS UUID, CPU ProcessorId,
    /// and Motherboard SerialNumber to detect disk cloning across cafe PCs (Section 6.5).
    /// </summary>
    public static class HardwareFingerprint
    {
        public static string Compute()
        {
            string biosUuid = QueryWmiProperty("Win32_ComputerSystemProduct", "UUID");
            string cpuId = QueryWmiProperty("Win32_Processor", "ProcessorId");
            string boardSerial = QueryWmiProperty("Win32_BaseBoard", "SerialNumber");

            string raw = string.Format("{0}|{1}|{2}", biosUuid, cpuId, boardSerial);
            return "HW-" + CryptoHelper.ComputeSha256Hex(raw).Substring(0, 32).ToUpperInvariant();
        }

        private static string QueryWmiProperty(string wmiClass, string propertyName)
        {
            try
            {
                using (var searcher = new ManagementObjectSearcher(string.Format("SELECT {0} FROM {1}", propertyName, wmiClass)))
                {
                    foreach (ManagementObject obj in searcher.Get())
                    {
                        var val = obj[propertyName];
                        if (val != null)
                        {
                            return val.ToString().Trim();
                        }
                    }
                }
            }
            catch
            {
                // Fallback if WMI query is restricted
            }
            return Environment.MachineName;
        }
    }
}
