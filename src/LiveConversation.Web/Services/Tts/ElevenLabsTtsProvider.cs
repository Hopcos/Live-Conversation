using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using LiveConversation.Web.Models;
using LiveConversation.Web.Services.Abstractions;
using Microsoft.Extensions.Options;

namespace LiveConversation.Web.Services.Tts;

public class ElevenLabsTtsProvider : ITtsProvider
{
    private readonly HttpClient _httpClient;
    private readonly AppSettings _appSettings;
    private readonly ILogger<ElevenLabsTtsProvider> _logger;

    public string ProviderName => "ElevenLabs";

    public ElevenLabsTtsProvider(
        HttpClient httpClient, 
        IOptions<AppSettings> appSettings,
        ILogger<ElevenLabsTtsProvider> logger)
    {
        _httpClient = httpClient;
        _appSettings = appSettings.Value;
        _logger = logger;
    }

    public async Task<byte[]> SynthesizeAsync(
        string text, 
        VoiceProfile profile, 
        string? apiKeyOverride = null, 
        CancellationToken ct = default)
    {
        var apiKey = !string.IsNullOrWhiteSpace(apiKeyOverride) 
            ? apiKeyOverride 
            : _appSettings.ElevenLabs.ApiKey;

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException("ElevenLabs API Key is not configured. Please configure it in settings or switch to EdgeTTS.");
        }

        var voiceId = !string.IsNullOrWhiteSpace(profile.VoiceId) 
            ? profile.VoiceId 
            : "21m00Tcm4TlvDq8ikWAM"; // Default Rachel

        var modelId = !string.IsNullOrWhiteSpace(_appSettings.ElevenLabs.ModelId)
            ? _appSettings.ElevenLabs.ModelId
            : "eleven_turbo_v2_5";

        var url = $"https://api.elevenlabs.io/v1/text-to-speech/{voiceId}?output_format=mp3_44100_128";

        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Add("xi-api-key", apiKey);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("audio/mpeg"));

        var payload = new
        {
            text = text,
            model_id = modelId,
            voice_settings = new
            {
                stability = 0.5,
                similarity_boost = 0.75,
                style = 0.0,
                use_speaker_boost = true
            }
        };

        request.Content = new StringContent(
            JsonSerializer.Serialize(payload), 
            Encoding.UTF8, 
            "application/json");

        _logger.LogInformation("Synthesizing speech with ElevenLabs: Voice {VoiceId}, Text: {TextPreview}...", 
            voiceId, text.Length > 30 ? text[..30] : text);

        using var response = await _httpClient.SendAsync(request, ct);
        
        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync(ct);
            _logger.LogError("ElevenLabs synthesis error ({StatusCode}): {Error}", response.StatusCode, err);
            throw new HttpRequestException($"ElevenLabs error: {response.StatusCode} - {err}");
        }

        return await response.Content.ReadAsByteArrayAsync(ct);
    }
}
