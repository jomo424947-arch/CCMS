using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;

namespace CCMS.Agent.Service
{
    /// <summary>
    /// Launches CCMS.Agent.Companion.exe inside the active interactive user desktop session (Session 1+)
    /// from the Session 0 Windows Service using WTSGetActiveConsoleSessionId, WTSQueryUserToken,
    /// DuplicateTokenEx, and CreateProcessAsUser (Architecture Section 4.1).
    /// </summary>
    public static class Session0Launcher
    {
        private const int TOKEN_DUPLICATE = 0x0002;
        private const int TOKEN_QUERY = 0x0008;
        private const int TOKEN_ASSIGN_PRIMARY = 0x0001;
        private const int MAXIMUM_ALLOWED = 0x2000000;
        private const int CREATE_UNICODE_ENVIRONMENT = 0x00000400;
        private const int NORMAL_PRIORITY_CLASS = 0x00000020;

        [DllImport("kernel32.dll")]
        private static extern uint WTSGetActiveConsoleSessionId();

        [DllImport("wtsapi32.dll", SetLastError = true)]
        private static extern bool WTSQueryUserToken(uint sessionId, out IntPtr phToken);

        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool DuplicateTokenEx(
            IntPtr ExistingTokenHandle,
            uint dwDesiredAccess,
            IntPtr lpThreadAttributes,
            int ImpersonationLevel,
            int TokenType,
            out IntPtr DuplicateTokenHandle);

        [DllImport("userenv.dll", SetLastError = true)]
        private static extern bool CreateEnvironmentBlock(out IntPtr lpEnvironment, IntPtr hToken, bool bInherit);

        [DllImport("userenv.dll", SetLastError = true)]
        private static extern bool DestroyEnvironmentBlock(IntPtr lpEnvironment);

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool CreateProcessAsUser(
            IntPtr hToken,
            string lpApplicationName,
            string lpCommandLine,
            IntPtr lpProcessAttributes,
            IntPtr lpThreadAttributes,
            bool bInheritHandles,
            uint dwCreationFlags,
            IntPtr lpEnvironment,
            string lpCurrentDirectory,
            ref STARTUPINFO lpStartupInfo,
            out PROCESS_INFORMATION lpProcessInformation);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct STARTUPINFO
        {
            public int cb;
            public string lpReserved;
            public string lpDesktop;
            public string lpTitle;
            public int dwX;
            public int dwY;
            public int dwXSize;
            public int dwYSize;
            public int dwXCountChars;
            public int dwYCountChars;
            public int dwFillAttribute;
            public int dwFlags;
            public short wShowWindow;
            public short cbReserved2;
            public IntPtr lpReserved2;
            public IntPtr hStdInput;
            public IntPtr hStdOutput;
            public IntPtr hStdError;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct PROCESS_INFORMATION
        {
            public IntPtr hProcess;
            public IntPtr hThread;
            public int dwProcessId;
            public int dwThreadId;
        }

        public static void EnsureCompanionRunning(string companionExePath)
        {
            if (!File.Exists(companionExePath)) return;

            uint activeSessionId = WTSGetActiveConsoleSessionId();
            if (activeSessionId == 0xFFFFFFFF || activeSessionId == 0) return;

            var running = Process.GetProcessesByName("CCMS.Agent.Companion");
            foreach (var proc in running)
            {
                if ((uint)proc.SessionId == activeSessionId)
                {
                    return; // Already alive in the active user session
                }
            }

            LaunchInSession(activeSessionId, companionExePath);
        }

        private static void LaunchInSession(uint sessionId, string exePath)
        {
            IntPtr userToken = IntPtr.Zero;
            IntPtr primaryToken = IntPtr.Zero;
            IntPtr envBlock = IntPtr.Zero;

            try
            {
                if (!WTSQueryUserToken(sessionId, out userToken)) return;

                if (!DuplicateTokenEx(
                    userToken,
                    MAXIMUM_ALLOWED | TOKEN_ASSIGN_PRIMARY | TOKEN_DUPLICATE | TOKEN_QUERY,
                    IntPtr.Zero,
                    2, // SecurityIdentification
                    1, // TokenPrimary
                    out primaryToken))
                {
                    return;
                }

                CreateEnvironmentBlock(out envBlock, primaryToken, false);

                var si = new STARTUPINFO
                {
                    cb = Marshal.SizeOf(typeof(STARTUPINFO)),
                    lpDesktop = @"winsta0\default"
                };

                PROCESS_INFORMATION pi;
                uint flags = (uint)(NORMAL_PRIORITY_CLASS | CREATE_UNICODE_ENVIRONMENT);

                if (CreateProcessAsUser(
                    primaryToken,
                    exePath,
                    "\"" + exePath + "\"",
                    IntPtr.Zero,
                    IntPtr.Zero,
                    false,
                    flags,
                    envBlock,
                    Path.GetDirectoryName(exePath),
                    ref si,
                    out pi))
                {
                    CloseHandle(pi.hProcess);
                    CloseHandle(pi.hThread);
                }
            }
            finally
            {
                if (envBlock != IntPtr.Zero) DestroyEnvironmentBlock(envBlock);
                if (primaryToken != IntPtr.Zero) CloseHandle(primaryToken);
                if (userToken != IntPtr.Zero) CloseHandle(userToken);
            }
        }
    }
}
