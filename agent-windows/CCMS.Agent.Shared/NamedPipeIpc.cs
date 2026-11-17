using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace CCMS.Agent.Shared
{
    /// <summary>
    /// Bidirectional Named Pipe IPC (\\.\pipe\CCMS_Agent_IPC) bridging the Session 0
    /// Windows Service (CCMS.Agent.Service) and the Session 1+ Desktop UI Companion (CCMS.Agent.Companion).
    /// </summary>
    public static class NamedPipeIpc
    {
        public const string PipeName = "CCMS_Agent_IPC";
        private static readonly JavaScriptSerializer Serializer = new JavaScriptSerializer();

        public static async Task SendToServiceAsync(PipeIpcMessage message, int timeoutMs = 2000)
        {
            using (var client = new NamedPipeClientStream(".", PipeName, PipeDirection.InOut, PipeOptions.Asynchronous))
            {
                client.Connect(timeoutMs);
                string json = Serializer.Serialize(message);
                byte[] bytes = Encoding.UTF8.GetBytes(json + "\n");
                await client.WriteAsync(bytes, 0, bytes.Length);
                await client.FlushAsync();
            }
        }

        public static void StartServerLoop(Func<PipeIpcMessage, PipeIpcMessage> onMessageReceived, CancellationToken token)
        {
            Task.Run(async () =>
            {
                while (!token.IsCancellationRequested)
                {
                    try
                    {
                        using (var server = new NamedPipeServerStream(
                            PipeName,
                            PipeDirection.InOut,
                            NamedPipeServerStream.MaxAllowedServerInstances,
                            PipeTransmissionMode.Byte,
                            PipeOptions.Asynchronous))
                        {
                            await Task.Factory.FromAsync(server.BeginWaitForConnection, server.EndWaitForConnection, null);
                            using (var reader = new StreamReader(server, Encoding.UTF8, false, 4096, true))
                            using (var writer = new StreamWriter(server, Encoding.UTF8, 4096, true) { AutoFlush = true })
                            {
                                string line = await reader.ReadLineAsync();
                                if (!string.IsNullOrWhiteSpace(line))
                                {
                                    var incoming = Serializer.Deserialize<PipeIpcMessage>(line);
                                    var response = onMessageReceived(incoming);
                                    if (response != null)
                                    {
                                        await writer.WriteLineAsync(Serializer.Serialize(response));
                                    }
                                }
                            }
                        }
                    }
                    catch
                    {
                        await Task.Delay(250, token);
                    }
                }
            }, token);
        }
    }
}
