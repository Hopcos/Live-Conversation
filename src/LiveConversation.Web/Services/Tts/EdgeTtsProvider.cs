using System.Buffers.Binary;
using System.Net.WebSockets;
using System.Security;
using System.Security.Cryptography;
using System.Text;
using LiveConversation.Web.Models;
using LiveConversation.Web.Services.Abstractions;

namespace LiveConversation.Web.Services.Tts;

public class EdgeTtsProvider : ITtsProvider
{
    private const string TrustedClientToken = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
    private const string EdgeWssBaseUrl = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
    private readonly ILogger<EdgeTtsProvider> _logger;

    public string ProviderName => "EdgeTTS";

    public EdgeTtsProvider(ILogger<EdgeTtsProvider> logger)
    {
        _logger = logger;
    }

    public async Task<byte[]> SynthesizeAsync(
        string text, 
        VoiceProfile profile, 
        string? apiKeyOverride = null, 
        CancellationToken ct = default)
    {
        var voiceName = !string.IsNullOrWhiteSpace(profile.VoiceId) 
            ? profile.VoiceId 
            : "en-US-JennyNeural";

        var ratePercent = (int)Math.Round((profile.Rate - 1.0f) * 100);
        var rateStr = ratePercent >= 0 ? $"+{ratePercent}%" : $"{ratePercent}%";

        _logger.LogInformation("Synthesizing speech with EdgeTTS: Voice {Voice}, Rate {Rate}, Text: {TextPreview}...", 
            voiceName, rateStr, text.Length > 30 ? text[..30] : text);

        var connectionId = Guid.NewGuid().ToString("N");
        var secMsGec = GenerateSecMsGec();
        var wsUri = new Uri($"{EdgeWssBaseUrl}?TrustedClientToken={TrustedClientToken}&Sec-MS-GEC={secMsGec}&Sec-MS-GEC-Version=1-130.0.2849.68&ConnectionId={connectionId}");

        using var ws = new ClientWebSocket();
        ws.Options.SetRequestHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0");
        ws.Options.SetRequestHeader("Origin", "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold");
        ws.Options.SetRequestHeader("Pragma", "no-cache");
        ws.Options.SetRequestHeader("Cache-Control", "no-cache");

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromSeconds(15)); // 15s timeout safeguard

        await ws.ConnectAsync(wsUri, cts.Token);

        // 1. Send speech.config
        var configMsg = "Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{\"context\":{\"synthesis\":{\"audio\":{\"metadataoptions\":{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"false\"},\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}";
        var configBytes = Encoding.UTF8.GetBytes(configMsg);
        await ws.SendAsync(new ArraySegment<byte>(configBytes), WebSocketMessageType.Text, true, cts.Token);

        // 2. Send SSML
        var requestId = Guid.NewGuid().ToString("N");
        var escapedText = SecurityElement.Escape(text);
        var ssml = $"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='{voiceName}'><prosody pitch='+0Hz' rate='{rateStr}'>{escapedText}</prosody></voice></speak>";
        var ssmlMsg = $"X-RequestId:{requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n{ssml}";
        var ssmlBytes = Encoding.UTF8.GetBytes(ssmlMsg);
        await ws.SendAsync(new ArraySegment<byte>(ssmlBytes), WebSocketMessageType.Text, true, cts.Token);

        // 3. Receive audio data
        using var audioStream = new MemoryStream();
        var buffer = new byte[16384];

        while (ws.State == WebSocketState.Open && !cts.Token.IsCancellationRequested)
        {
            var result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), cts.Token);
            if (result.MessageType == WebSocketMessageType.Close)
            {
                break;
            }

            if (result.MessageType == WebSocketMessageType.Text)
            {
                var textMsg = Encoding.UTF8.GetString(buffer, 0, result.Count);
                if (textMsg.Contains("Path:turn.end"))
                {
                    // Synthesis completed!
                    break;
                }
            }
            else if (result.MessageType == WebSocketMessageType.Binary && result.Count > 2)
            {
                // Binary frame format:
                // 2 bytes: header length (Big Endian)
                // headerLen bytes: header string (e.g. "X-RequestId:...Path:audio\r\n")
                // remaining bytes: audio data
                int headerLen = BinaryPrimitives.ReadInt16BigEndian(buffer.AsSpan(0, 2));
                if (headerLen > 0 && result.Count > 2 + headerLen)
                {
                    int audioOffset = 2 + headerLen;
                    int audioCount = result.Count - audioOffset;
                    audioStream.Write(buffer, audioOffset, audioCount);
                }
            }
        }

        try
        {
            if (ws.State == WebSocketState.Open)
            {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Complete", CancellationToken.None);
            }
        }
        catch { /* ignore cleanup error */ }

        var resultAudio = audioStream.ToArray();
        _logger.LogInformation("EdgeTTS synthesis completed: {Bytes} bytes", resultAudio.Length);
        return resultAudio;
    }

    /// <summary>
    /// Generates rolling cryptographic Sec-MS-GEC token required by Microsoft Edge speech servers.
    /// </summary>
    private static string GenerateSecMsGec()
    {
        long unixSeconds = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        long winSeconds = unixSeconds + 11644473600L;
        long rounded = winSeconds - (winSeconds % 300);
        long ticks = rounded * 10_000_000L;
        string toHash = $"{ticks}{TrustedClientToken}";
        byte[] hash = SHA256.HashData(Encoding.ASCII.GetBytes(toHash));
        return Convert.ToHexString(hash).ToUpperInvariant();
    }
}
