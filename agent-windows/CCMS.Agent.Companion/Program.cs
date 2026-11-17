using System;
using System.Threading;
using System.Windows.Forms;

namespace CCMS.Agent.Companion
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            bool createdNew;
            using (new Mutex(true, "Global\\CCMS_Agent_Companion_SingleInstance", out createdNew))
            {
                if (!createdNew) return;

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new LockScreenForm());
            }
        }
    }
}
