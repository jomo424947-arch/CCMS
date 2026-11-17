using System;
using System.ServiceProcess;

namespace CCMS.Agent.Service
{
    internal static class Program
    {
        private static void Main(string[] args)
        {
            // Support silent CLI pairing during Inno Setup installation:
            // CCMS.Agent.Service.exe --pair --server 192.168.1.10 --code 482910
            if (args != null && args.Length > 0 && args[0] == "--pair")
            {
                string serverIp = null;
                string code = null;
                for (int i = 1; i < args.Length - 1; i++)
                {
                    if (args[i] == "--server") serverIp = args[i + 1];
                    if (args[i] == "--code") code = args[i + 1];
                }
                if (!string.IsNullOrEmpty(code))
                {
                    var svc = new AgentWindowsService();
                    svc.TryPairWithController(serverIp, code);
                }
                return;
            }

            ServiceBase.Run(new ServiceBase[] { new AgentWindowsService() });
        }
    }
}
