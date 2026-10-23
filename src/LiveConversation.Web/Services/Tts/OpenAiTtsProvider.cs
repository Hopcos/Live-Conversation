using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using LiveConversation.Web.Models;
using LiveConversation.Web.Services.Abstractions;
using Microsoft.Extensions.Options;

namespace LiveConversation.Web.Services.Tts;

public class OpenAiTtsProvider : ITtsProvider
{
    private readonly HttpClient _httpClient;
    private readonly AppSettings _appSettings;
    private readonly ILogger<OpenAiTtsProvider> _logger;

    public string ProviderName => "OpenAITTS";

    public OpenAiTtsProvider(
        HttpClient httpClient, 
        IOptions<AppSettings> appSettings,
        ILogger<OpenAiTtsProvider> logger)
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
            : _appSettings.Llm.ApiKey;

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException("LLM / OpenAI API Key is not configured for OpenAITTS.");
        }

        var endpoint = !string.IsNullOrWhiteSpace(_appSettings.Llm.Endpoint)
            ? _appSettings.Llm.Endpoint.TrimEnd('/')
            : "https://api.openai.com/v1";

        var url = $"{endpoint}/audio/speech";

        // Map voice profile to OpenAI voice models
        var voice = profile.CountryCode switch
        {
            "UK" => "fable",    // British-like accent
            "IN" => "shimmer",
            "CA" => "nova",
            "CN" => "alloy",     // Standard Chinese Mandarin
            "CN-EN" => "nova",  // Bilingual English & Chinese
            "RO" => "alloy",
            "UA" => "fable",
            _ => "alloy"        // Standard American
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("audio/mpeg"));

        var payload = new
        {
            model = "tts-1",
            input = text,
            voice = voice,
            speed = profile.Rate
        };

        request.Content = new StringContent(
            JsonSerializer.Serialize(payload), 
            Encoding.UTF8, 
            "application/json");

        _logger.LogInformation("Synthesizing speech with OpenAITTS: Voice {Voice}, Text: {TextPreview}...", 
            voice, text.Length > 30 ? text[..30] : text);

        using var response = await _httpClient.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync(ct);
            _logger.LogError("OpenAITTS error ({StatusCode}): {Error}", response.StatusCode, err);
            throw new HttpRequestException($"OpenAITTS error: {response.StatusCode} - {err}");
        }

        return await response.Content.ReadAsByteArrayAsync(ct);
    }
}
