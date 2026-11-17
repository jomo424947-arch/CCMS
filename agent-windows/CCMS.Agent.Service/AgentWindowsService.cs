using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.ServiceProcess;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using CCMS.Agent.Shared;

namespace CCMS.Agent.Service
{
    /// <summary>
    /// Session 0 Windows Service (CCMS.Agent.Service)
    /// Handles UDP discovery, WebSocket connection to /ws/agent, Ed25519 command verification,
    /// DPAPI state persistence, and the 2-second watchdog for CCMS.Agent.Companion.exe.
    /// </summary>
    public class AgentWindowsService : ServiceBase
    {
        private CancellationTokenSource _cts;
        private AgentLocalState _state;
        private bool _isConnectedToServer;
        private PipeIpcMessage _pendingToastMessage;
        private readonly HashSet<string> _recentCommandIds = new HashSet<string>();
        private readonly JavaScriptSerializer _serializer = new JavaScriptSerializer();

        public AgentWindowsService()
        {
            ServiceName = "CCMSAgentService";
            CanStop = true;
            CanShutdown = true;
        }

        protected override void OnStart(string[] args)
        {
            _cts = new CancellationTokenSource();
            _state = DpapiStateStore.Load();

            // Verify hardware fingerprint has not changed (Disk Clone Detection)
            string currentHw = HardwareFingerprint.Compute();
            if (_state.IsPaired && !string.Equals(_state.HardwareFingerprint, currentHw, StringComparison.OrdinalIgnoreCase))
            {
                _state.CurrentLockState = AgentLockState.Locked;
            }
            _state.HardwareFingerprint = currentHw;
            DpapiStateStore.Save(_state);

            NamedPipeIpc.StartServerLoop(HandleCompanionIpcMessage, _cts.Token);
            Task.Run(() => RunWatchdogLoopAsync(_cts.Token));
            Task.Run(() => RunWebSocketControlLoopAsync(_cts.Token));
        }

        protected override void OnStop()
        {
            _cts?.Cancel();
        }

        private PipeIpcMessage HandleCompanionIpcMessage(PipeIpcMessage req)
        {
            if (req == null) return BuildSyncResponse();

            if (req.Action == "EMERGENCY_PIN_UNLOCK" && !string.IsNullOrEmpty(req.EmergencyPin))
            {
                string pinHash = CryptoHelper.ComputeSha256Hex(req.EmergencyPin);
                if (string.Equals(pinHash, _state.OfflinePinSha256Hash, StringComparison.OrdinalIgnoreCase))
                {
                    _state.CurrentLockState = AgentLockState.Maintenance;
                    DpapiStateStore.Save(_state);
                }
            }
            else if (req.Action == "PAIR_REQUEST" && !string.IsNullOrEmpty(req.PairingCode))
            {
                TryPairWithController(req.ServerIp, req.PairingCode);
            }

            var resp = BuildSyncResponse();
            _pendingToastMessage = null;
            return resp;
        }

        private PipeIpcMessage BuildSyncResponse()
        {
            return new PipeIpcMessage
            {
                Action = _pendingToastMessage != null ? "DISPLAY_MESSAGE" : "STATE_SYNC",
                LockState = _state.IsPaired ? _state.CurrentLockState : AgentLockState.Unpaired,
                DeviceName = _state.DeviceName,
                DeviceNumber = _state.DeviceNumber,
                CafeName = _state.CafeName,
                IsConnectedToServer = _isConnectedToServer,
                ActiveSessionId = _state.ActiveSessionId,
                SessionType = _state.SessionType,
                RemainingSeconds = _state.RemainingSeconds,
                MessageTitle = _pendingToastMessage?.MessageTitle,
                MessageBody = _pendingToastMessage?.MessageBody,
                MessageSeverity = _pendingToastMessage?.MessageSeverity
            };
        }

        private async Task RunWatchdogLoopAsync(CancellationToken token)
        {
            string companionPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "CCMS.Agent.Companion.exe");
            while (!token.IsCancellationRequested)
            {
                try
                {
                    Session0Launcher.EnsureCompanionRunning(companionPath);
                    if (_state.RemainingSeconds.HasValue && _state.RemainingSeconds.Value > 0 &&
                        _state.CurrentLockState == AgentLockState.UnlockedInSession)
                    {
                        _state.RemainingSeconds = Math.Max(0, _state.RemainingSeconds.Value - 2);
                    }
                }
                catch { }
                await Task.Delay(2000, token);
            }
        }

        private async Task RunWebSocketControlLoopAsync(CancellationToken token)
        {
            int backoffMs = 2000;
            while (!token.IsCancellationRequested)
            {
                try
                {
                    if (!_state.IsPaired || string.IsNullOrEmpty(_state.ControllerWsUrl))
                    {
                        DiscoverControllerOnLan();
                        await Task.Delay(5000, token);
                        continue;
                    }

                    using (var ws = new ClientWebSocket())
                    {
                        ws.Options.SetRequestHeader("Authorization", "Bearer " + _state.AgentToken);
                        ws.Options.SetRequestHeader("X-Device-Id", _state.DeviceId);

                        await ws.ConnectAsync(new Uri(_state.ControllerWsUrl), token);
                        _isConnectedToServer = true;
                        backoffMs = 2000;

                        // Send AGENT_HELLO_RECONCILE immediately upon connection
                        await SendJsonAsync(ws, new
                        {
                            type = "AGENT_HELLO_RECONCILE",
                            device_id = _state.DeviceId,
                            hardware_fingerprint = _state.HardwareFingerprint,
                            agent_version = "1.2.0-win64",
                            current_lock_state = _state.CurrentLockState == AgentLockState.UnlockedInSession ? "unlocked" : "locked",
                            active_local_session_id = _state.ActiveSessionId
                        }, token);

                        var heartbeatTask = RunHeartbeatLoopAsync(ws, token);
                        await ReceiveMessagesLoopAsync(ws, token);
                    }
                }
                catch
                {
                    _isConnectedToServer = false;
                    await Task.Delay(backoffMs, token);
                    backoffMs = Math.Min(30000, backoffMs * 2);
                }
            }
        }

        private async Task RunHeartbeatLoopAsync(ClientWebSocket ws, CancellationToken token)
        {
            while (ws.State == WebSocketState.Open && !token.IsCancellationRequested)
            {
                await Task.Delay(10000, token);
                if (ws.State != WebSocketState.Open) break;

                await SendJsonAsync(ws, new
                {
                    type = "HEARTBEAT",
                    device_id = _state.DeviceId,
                    lock_state = _state.CurrentLockState == AgentLockState.UnlockedInSession
                        ? "unlocked"
                        : _state.CurrentLockState == AgentLockState.Maintenance ? "maintenance" : "locked",
                    cpu_percent = 12,
                    ram_percent = 38,
                    uptime_seconds = Environment.TickCount / 1000,
                    active_session_id = _state.ActiveSessionId,
                    agent_version = "1.2.0-win64"
                }, token);
            }
        }

        private async Task ReceiveMessagesLoopAsync(ClientWebSocket ws, CancellationToken token)
        {
            var buffer = new byte[16384];
            while (ws.State == WebSocketState.Open && !token.IsCancellationRequested)
            {
                var result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), token);
                if (result.MessageType == WebSocketMessageType.Close) break;

                string json = Encoding.UTF8.GetString(buffer, 0, result.Count);
                var dict = _serializer.Deserialize<Dictionary<string, object>>(json);
                if (dict == null || !dict.ContainsKey("type")) continue;

                string msgType = Convert.ToString(dict["type"]);
                if (msgType == "COMMAND_ENVELOPE" && dict.ContainsKey("envelope"))
                {
                    string envJson = _serializer.Serialize(dict["envelope"]);
                    var envelope = _serializer.Deserialize<CommandEnvelope>(envJson);
                    await HandleSignedCommandEnvelopeAsync(ws, envelope, token);
                }
                else if (msgType == "CLONE_DETECTED_REPAIR_REQUIRED")
                {
                    _state.CurrentLockState = AgentLockState.Locked;
                    DpapiStateStore.Save(_state);
                }
            }
        }

        private async Task HandleSignedCommandEnvelopeAsync(ClientWebSocket ws, CommandEnvelope env, CancellationToken token)
        {
            if (!CryptoHelper.ValidateCommandEnvelope(
                env,
                _state.DeviceId,
                _state.LastSequenceNumber,
                _state.ServerPublicKeyPem,
                _recentCommandIds,
                out string rejectionReason))
            {
                await SendJsonAsync(ws, new
                {
                    type = "TAMPER_ALERT",
                    command_id = env?.command_id,
                    reason = rejectionReason
                }, token);
                return;
            }

            _state.LastSequenceNumber = env.sequence_number;
            _recentCommandIds.Add(env.command_id);

            switch (env.command_type)
            {
                case "SESSION_START_UNLOCK":
                case "SESSION_RESUME_UNLOCK":
                    _state.CurrentLockState = AgentLockState.UnlockedInSession;
                    _state.ActiveSessionId = env.payload.ContainsKey("session_id") ? Convert.ToString(env.payload["session_id"]) : null;
                    _state.SessionType = env.payload.ContainsKey("session_type") ? Convert.ToString(env.payload["session_type"]) : "open";
                    if (env.payload.ContainsKey("duration_seconds") && env.payload["duration_seconds"] != null)
                        _state.RemainingSeconds = Convert.ToInt32(env.payload["duration_seconds"]);
                    else
                        _state.RemainingSeconds = null;
                    break;

                case "SESSION_UPDATE_TIME":
                    if (env.payload.ContainsKey("duration_seconds") && env.payload["duration_seconds"] != null)
                        _state.RemainingSeconds = Convert.ToInt32(env.payload["duration_seconds"]);
                    break;

                case "SESSION_PAUSE_LOCK":
                case "SESSION_END_LOCK":
                    _state.CurrentLockState = AgentLockState.Locked;
                    if (env.command_type == "SESSION_END_LOCK")
                    {
                        _state.ActiveSessionId = null;
                        _state.RemainingSeconds = null;
                    }
                    break;

                case "DISPLAY_MESSAGE":
                    _pendingToastMessage = new PipeIpcMessage
                    {
                        MessageTitle = env.payload.ContainsKey("title") ? Convert.ToString(env.payload["title"]) : "Message from Counter",
                        MessageBody = env.payload.ContainsKey("message") ? Convert.ToString(env.payload["message"]) : "",
                        MessageSeverity = env.payload.ContainsKey("severity") ? Convert.ToString(env.payload["severity"]) : "info"
                    };
                    break;

                case "ADMIN_MAINTENANCE_UNLOCK":
                case "ENTER_MAINTENANCE":
                    bool enabled = !env.payload.ContainsKey("enabled") || Convert.ToBoolean(env.payload["enabled"]);
                    _state.CurrentLockState = enabled ? AgentLockState.Maintenance : AgentLockState.Locked;
                    break;

                case "EXIT_MAINTENANCE":
                    _state.CurrentLockState = AgentLockState.Locked;
                    break;

                case "AGENT_UNPAIR_UNLOCK":
                case "REVOKE_CREDENTIAL":
                    _state.IsPaired = false;
                    _state.AgentToken = null;
                    _state.CurrentLockState = AgentLockState.Unpaired;
                    break;

                case "SYSTEM_RESTART":
                    Process.Start("shutdown.exe", "/r /t 3 /f");
                    break;

                case "SYSTEM_SHUTDOWN":
                    Process.Start("shutdown.exe", "/s /t 3 /f");
                    break;
            }

            DpapiStateStore.Save(_state);

            await SendJsonAsync(ws, new
            {
                type = "COMMAND_ACK",
                command_id = env.command_id,
                status = "acked"
            }, token);
        }

        private void DiscoverControllerOnLan()
        {
            try
            {
                using (var udp = new UdpClient())
                {
                    udp.EnableBroadcast = true;
                    udp.Client.ReceiveTimeout = 1500;
                    byte[] msg = Encoding.UTF8.GetBytes("{\"type\":\"CCMS_DISCOVER_V1\"}");
                    udp.Send(msg, msg.Length, new IPEndPoint(IPAddress.Broadcast, 5001));

                    IPEndPoint remote = new IPEndPoint(IPAddress.Any, 0);
                    byte[] resp = udp.Receive(ref remote);
                    var dict = _serializer.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(resp));
                    if (dict != null && dict.ContainsKey("ws_url"))
                    {
                        _state.ControllerWsUrl = Convert.ToString(dict["ws_url"]);
                        _state.ControllerApiUrl = Convert.ToString(dict["api_url"]);
                        _state.CafeName = Convert.ToString(dict["cafe_name"]);
                        DpapiStateStore.Save(_state);
                    }
                }
            }
            catch { }
        }

        public bool TryPairWithController(string serverIp, string pairingCode)
        {
            try
            {
                string apiUrl = !string.IsNullOrEmpty(serverIp)
                    ? string.Format("http://{0}:5000/api/agent/pair", serverIp.Trim())
                    : (_state.ControllerApiUrl ?? "http://127.0.0.1:5000/api/agent/pair");

                using (var wc = new WebClient())
                {
                    wc.Headers[HttpRequestHeader.ContentType] = "application/json";
                    string body = _serializer.Serialize(new
                    {
                        pairing_code = pairingCode.Trim(),
                        hostname = Environment.MachineName,
                        hardware_fingerprint = _state.HardwareFingerprint,
                        agent_public_key = Convert.ToBase64String(Encoding.UTF8.GetBytes(_state.HardwareFingerprint)),
                        agent_version = "1.2.0-win64"
                    });

                    string respJson = wc.UploadString(apiUrl, "POST", body);
                    var root = _serializer.Deserialize<Dictionary<string, object>>(respJson);
                    if (root != null && root.ContainsKey("data") && root["data"] is Dictionary<string, object> data)
                    {
                        _state.IsPaired = true;
                        _state.DeviceId = Convert.ToString(data["device_id"]);
                        _state.DeviceName = Convert.ToString(data["device_name"]);
                        _state.TenantId = Convert.ToString(data["tenant_id"]);
                        _state.AgentToken = Convert.ToString(data["agent_token"]);
                        _state.ControllerWsUrl = Convert.ToString(data["ws_url"]);
                        _state.ServerPublicKeyPem = Convert.ToString(data["server_public_key"]);
                        _state.ServerPublicKeyFingerprint = Convert.ToString(data["server_public_key_fingerprint"]);
                        _state.CurrentLockState = AgentLockState.Locked;
                        DpapiStateStore.Save(_state);
                        return true;
                    }
                }
            }
            catch { }
            return false;
        }

        private async Task SendJsonAsync(ClientWebSocket ws, object payload, CancellationToken token)
        {
            string json = _serializer.Serialize(payload);
            byte[] bytes = Encoding.UTF8.GetBytes(json);
            await ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, token);
        }
    }
}
