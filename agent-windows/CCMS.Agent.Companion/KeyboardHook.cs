using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace CCMS.Agent.Companion
{
    /// <summary>
    /// Low-level Keyboard Hook (WH_KEYBOARD_LL) active ONLY while the PC is in Locked state.
    /// Blocks Alt+Tab, Alt+F4, Left/Right Windows keys, and Ctrl+Esc.
    /// Unhooked immediately during active gaming sessions for zero anti-cheat impact (Section 4.3).
    /// Also detects Ctrl+Alt+Shift+U for emergency offline technician PIN prompt.
    /// </summary>
    public sealed class KeyboardHook : IDisposable
    {
        private const int WH_KEYBOARD_LL = 13;
        private const int WM_KEYDOWN = 0x0100;
        private const int WM_SYSKEYDOWN = 0x0104;

        private IntPtr _hookId = IntPtr.Zero;
        private readonly LowLevelKeyboardProc _proc;
        private readonly Action _onEmergencyHotkey;

        public bool IsHookActive => _hookId != IntPtr.Zero;

        public KeyboardHook(Action onEmergencyHotkey)
        {
            _proc = HookCallback;
            _onEmergencyHotkey = onEmergencyHotkey;
        }

        public void EnableLockHook()
        {
            if (_hookId != IntPtr.Zero) return;
            using (Process curProcess = Process.GetCurrentProcess())
            using (ProcessModule curModule = curProcess.MainModule)
            {
                _hookId = SetWindowsHookEx(WH_KEYBOARD_LL, _proc, GetModuleHandle(curModule.ModuleName), 0);
            }
        }

        public void DisableLockHook()
        {
            if (_hookId == IntPtr.Zero) return;
            UnhookWindowsHookEx(_hookId);
            _hookId = IntPtr.Zero;
        }

        private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0 && (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN))
            {
                int vkCode = Marshal.ReadInt32(lParam);
                Keys key = (Keys)vkCode;

                bool alt = (Control.ModifierKeys & Keys.Alt) == Keys.Alt;
                bool ctrl = (Control.ModifierKeys & Keys.Control) == Keys.Control;
                bool shift = (Control.ModifierKeys & Keys.Shift) == Keys.Shift;

                // Emergency Technician Offline Unlock Hotkey: Ctrl + Alt + Shift + U
                if (ctrl && alt && shift && key == Keys.U)
                {
                    _onEmergencyHotkey?.Invoke();
                    return (IntPtr)1;
                }

                // Block Windows keys, Alt+Tab, Alt+F4, Alt+Esc, Ctrl+Esc while locked
                if (key == Keys.LWin || key == Keys.RWin ||
                    (alt && (key == Keys.Tab || key == Keys.F4 || key == Keys.Escape)) ||
                    (ctrl && key == Keys.Escape))
                {
                    return (IntPtr)1;
                }
            }
            return CallNextHookEx(_hookId, nCode, wParam, lParam);
        }

        public void Dispose()
        {
            DisableLockHook();
        }

        private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string lpModuleName);
    }
}
