using System;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;
using CCMS.Agent.Shared;

namespace CCMS.Agent.Companion
{
    /// <summary>
    /// Fullscreen Gaming Dark (#0A0A0A / #00C2FF) Lock Screen Overlay & Floating Session HUD
    /// running inside the interactive user desktop session (Session 1+).
    /// </summary>
    public class LockScreenForm : Form
    {
        private readonly KeyboardHook _keyboardHook;
        private readonly Timer _ipcPollTimer;
        private readonly Label _cafeTitleLabel;
        private readonly Label _deviceBadgeLabel;
        private readonly Label _statusSubtitleLabel;
        private readonly Panel _pairingPanel;
        private readonly TextBox _serverIpInput;
        private readonly TextBox _pairingOtpInput;
        private readonly Button _pairSubmitButton;

        private AgentLockState _currentState = AgentLockState.Locked;

        public LockScreenForm()
        {
            FormBorderStyle = FormBorderStyle.None;
            WindowState = FormWindowState.Maximized;
            TopMost = true;
            ShowInTaskbar = false;
            BackColor = Color.FromArgb(10, 10, 10); // #0A0A0A Gaming Dark
            DoubleBuffered = true;

            _cafeTitleLabel = new Label
            {
                Text = "CCMS ESPORTS ARENA",
                ForeColor = Color.FromArgb(0, 194, 255), // #00C2FF Cyan Accent
                Font = new Font("Segoe UI", 32, FontStyle.Bold),
                AutoSize = true
            };

            _deviceBadgeLabel = new Label
            {
                Text = Environment.MachineName,
                ForeColor = Color.White,
                Font = new Font("Consolas", 48, FontStyle.Bold),
                AutoSize = true
            };

            _statusSubtitleLabel = new Label
            {
                Text = "TERMINAL LOCKED — PLEASE START YOUR SESSION AT THE COUNTER",
                ForeColor = Color.FromArgb(160, 174, 192),
                Font = new Font("Segoe UI", 15, FontStyle.Regular),
                AutoSize = true
            };

            _pairingPanel = new Panel
            {
                Size = new Size(420, 220),
                BackColor = Color.FromArgb(20, 24, 33),
                Visible = false
            };

            var otpTitle = new Label
            {
                Text = "PAIR TERMINAL WITH CCMS CONTROLLER",
                ForeColor = Color.FromArgb(0, 194, 255),
                Font = new Font("Segoe UI", 11, FontStyle.Bold),
                Location = new Point(20, 18),
                AutoSize = true
            };

            _serverIpInput = new TextBox
            {
                Text = "192.168.1.10",
                Location = new Point(20, 55),
                Width = 380,
                Font = new Font("Consolas", 13)
            };

            _pairingOtpInput = new TextBox
            {
                Text = "",
                MaxLength = 6,
                Location = new Point(20, 100),
                Width = 380,
                Font = new Font("Consolas", 16, FontStyle.Bold)
            };

            _pairSubmitButton = new Button
            {
                Text = "PAIR DEVICE NOW",
                Location = new Point(20, 150),
                Size = new Size(380, 44),
                BackColor = Color.FromArgb(0, 194, 255),
                ForeColor = Color.Black,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 11, FontStyle.Bold)
            };
            _pairSubmitButton.Click += OnPairButtonClick;

            _pairingPanel.Controls.Add(otpTitle);
            _pairingPanel.Controls.Add(_serverIpInput);
            _pairingPanel.Controls.Add(_pairingOtpInput);
            _pairingPanel.Controls.Add(_pairSubmitButton);

            Controls.Add(_cafeTitleLabel);
            Controls.Add(_deviceBadgeLabel);
            Controls.Add(_statusSubtitleLabel);
            Controls.Add(_pairingPanel);

            Resize += (_, __) => LayoutCenteredElements();
            FormClosing += OnFormClosingPreventUserClose;

            _keyboardHook = new KeyboardHook(ShowEmergencyOfflinePinPrompt);
            _keyboardHook.EnableLockHook();

            _ipcPollTimer = new Timer { Interval = 1000 };
            _ipcPollTimer.Tick += async (_, __) => await PollServiceStateAsync();
            _ipcPollTimer.Start();
        }

        private void LayoutCenteredElements()
        {
            int cx = ClientSize.Width / 2;
            int cy = ClientSize.Height / 2;

            _cafeTitleLabel.Location = new Point(cx - (_cafeTitleLabel.Width / 2), cy - 190);
            _deviceBadgeLabel.Location = new Point(cx - (_deviceBadgeLabel.Width / 2), cy - 110);
            _statusSubtitleLabel.Location = new Point(cx - (_statusSubtitleLabel.Width / 2), cy - 10);
            _pairingPanel.Location = new Point(cx - (_pairingPanel.Width / 2), cy + 40);
        }

        private void OnFormClosingPreventUserClose(object sender, FormClosingEventArgs e)
        {
            if (_currentState == AgentLockState.Locked || _currentState == AgentLockState.Unpaired)
            {
                e.Cancel = true;
            }
        }

        private async void OnPairButtonClick(object sender, EventArgs e)
        {
            if (string.IsNullOrWhiteSpace(_pairingOtpInput.Text)) return;
            await NamedPipeIpc.SendToServiceAsync(new PipeIpcMessage
            {
                Action = "PAIR_REQUEST",
                ServerIp = _serverIpInput.Text.Trim(),
                PairingCode = _pairingOtpInput.Text.Trim()
            });
        }

        private async Task PollServiceStateAsync()
        {
            try
            {
                await NamedPipeIpc.SendToServiceAsync(new PipeIpcMessage { Action = "STATE_SYNC" }, 800);
            }
            catch
            {
                // Service temporarily busy
            }
        }

        public void ApplySyncState(PipeIpcMessage state)
        {
            if (state == null) return;
            _currentState = state.LockState;
            _cafeTitleLabel.Text = (state.CafeName ?? "CCMS ESPORTS ARENA").ToUpperInvariant();
            _deviceBadgeLabel.Text = state.DeviceNumber.HasValue
                ? string.Format("PC-{0:00}", state.DeviceNumber.Value)
                : (state.DeviceName ?? Environment.MachineName);

            if (_currentState == AgentLockState.UnlockedInSession || _currentState == AgentLockState.Maintenance)
            {
                _keyboardHook.DisableLockHook();
                Hide();
            }
            else
            {
                _pairingPanel.Visible = (_currentState == AgentLockState.Unpaired);
                _statusSubtitleLabel.Text = _currentState == AgentLockState.Unpaired
                    ? "UNPAIRED TERMINAL — ENTER 6-DIGIT PAIRING CODE FROM CCMS DASHBOARD"
                    : "TERMINAL LOCKED — PLEASE START YOUR SESSION AT THE COUNTER";
                _keyboardHook.EnableLockHook();
                if (!Visible) Show();
                BringToFront();
                LayoutCenteredElements();
            }

            if (state.Action == "DISPLAY_MESSAGE" && !string.IsNullOrEmpty(state.MessageBody))
            {
                MessageBox.Show(
                    state.MessageBody,
                    state.MessageTitle ?? "CCMS Notice",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }
        }

        private void ShowEmergencyOfflinePinPrompt()
        {
            using (var prompt = new Form())
            {
                prompt.Width = 340;
                prompt.Height = 160;
                prompt.Text = "Emergency Technician Offline PIN";
                prompt.StartPosition = FormStartPosition.CenterScreen;
                prompt.TopMost = true;

                var input = new TextBox { Left = 20, Top = 25, Width = 280, UseSystemPasswordChar = true };
                var ok = new Button { Text = "Unlock", Left = 20, Top = 65, Width = 280, DialogResult = DialogResult.OK };
                prompt.Controls.Add(input);
                prompt.Controls.Add(ok);
                prompt.AcceptButton = ok;

                if (prompt.ShowDialog(this) == DialogResult.OK && !string.IsNullOrWhiteSpace(input.Text))
                {
                    Task.Run(() => NamedPipeIpc.SendToServiceAsync(new PipeIpcMessage
                    {
                        Action = "EMERGENCY_PIN_UNLOCK",
                        EmergencyPin = input.Text.Trim()
                    }));
                }
            }
        }
    }
}
