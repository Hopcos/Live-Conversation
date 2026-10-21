using System.Net.Http.Headers;
using System.Text.Json;
using LiveConversation.Web.Models;
using LiveConversation.Web.Services.Abstractions;
using Microsoft.Extensions.Options;

namespace LiveConversation.Web.Services.Stt;

public class WhisperSttService : ISttService
{
    private readonly HttpClient _httpClient;
    private readonly AppSettings _appSettings;
    private readonly ILogger<WhisperSttService> _logger;

    public string ProviderName => "Whisper";

    public WhisperSttService(
        HttpClient httpClient,
        IOptions<AppSettings> appSettings,
        ILogger<WhisperSttService> logger)
    {
        _httpClient = httpClient;
        _appSettings = appSettings.Value;
        _logger = logger;
    }

    public async Task<string> TranscribeAsync(
        byte[] audioBytes, 
        string fileName, 
        ClientSettings? settings, 
        string? language = null, 
        CancellationToken ct = default)
    {
        if (audioBytes == null || audioBytes.Length == 0)
        {
            return string.Empty;
        }

        var apiKey = ResolveApiKey(settings);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException("Whisper API Key is not configured. Please provide an API Key in settings.");
        }

        var endpoint = ResolveEndpoint(settings);
        var url = $"{endpoint}/audio/transcriptions";

        var model = !string.IsNullOrWhiteSpace(settings?.WhisperModel)
            ? settings.WhisperModel
            : (!string.IsNullOrWhiteSpace(_appSettings.Whisper?.ModelId) ? _appSettings.Whisper.ModelId : "whisper-1");

        using var content = new MultipartFormDataContent();

        // 1. Audio file
        var mimeType = ResolveMimeType(fileName);
        var fileContent = new ByteArrayContent(audioBytes);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue(mimeType);
        content.Add(fileContent, "file", fileName);

        // 2. Model
        content.Add(new StringContent(model), "model");

        // 3. Optional Language
        var normalizedLang = NormalizeLanguage(language);
        if (!string.IsNullOrWhiteSpace(normalizedLang))
        {
            content.Add(new StringContent(normalizedLang), "language");
        }

        // 4. Response format
        content.Add(new StringContent("json"), "response_format");

        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        request.Content = content;

        _logger.LogInformation("Sending audio transcription request to {Url} with model {Model}, bytes={Length}, mime={Mime}",
            url, model, audioBytes.Length, mimeType);

        var response = await _httpClient.SendAsync(request, ct);

        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync(ct);
            var errorMessage = ExtractErrorMessage(errorBody, response.StatusCode);
            _logger.LogError("Whisper API error {StatusCode}: {ErrorBody}", response.StatusCode, errorBody);
            throw new HttpRequestException($"Whisper STT error: {errorMessage}");
        }

        var responseJson = await response.Content.ReadAsStringAsync(ct);
        using var doc = JsonDocument.Parse(responseJson);

        if (doc.RootElement.TryGetProperty("text", out var textProp))
        {
            var transcribedText = textProp.GetString()?.Trim() ?? string.Empty;
            _logger.LogInformation("Whisper transcribed successfully: {Text}", transcribedText);
            return transcribedText;
        }

        return string.Empty;
    }

    private string ResolveApiKey(ClientSettings? settings)
    {
        if (!string.IsNullOrWhiteSpace(settings?.WhisperApiKey))
            return settings.WhisperApiKey;
        if (!string.IsNullOrWhiteSpace(_appSettings.Whisper?.ApiKey))
            return _appSettings.Whisper.ApiKey;
        if (!string.IsNullOrWhiteSpace(settings?.LlmApiKey))
            return settings.LlmApiKey;
        if (!string.IsNullOrWhiteSpace(_appSettings.Llm?.ApiKey))
            return _appSettings.Llm.ApiKey;

        return string.Empty;
    }

    private string ResolveEndpoint(ClientSettings? settings)
    {
        string? rawEndpoint = null;
        if (!string.IsNullOrWhiteSpace(settings?.WhisperEndpoint))
            rawEndpoint = settings.WhisperEndpoint;
        else if (!string.IsNullOrWhiteSpace(_appSettings.Whisper?.Endpoint))
            rawEndpoint = _appSettings.Whisper.Endpoint;
        else if (!string.IsNullOrWhiteSpace(settings?.LlmEndpoint))
            rawEndpoint = settings.LlmEndpoint;
        else if (!string.IsNullOrWhiteSpace(_appSettings.Llm?.Endpoint))
            rawEndpoint = _appSettings.Llm.Endpoint;

        if (string.IsNullOrWhiteSpace(rawEndpoint))
        {
            return "https://api.openai.com/v1";
        }

        return rawEndpoint.TrimEnd('/');
    }

    private static string ResolveMimeType(string fileName)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        return ext switch
        {
            ".webm" => "audio/webm",
            ".wav" => "audio/wav",
            ".mp3" => "audio/mpeg",
            ".m4a" or ".mp4" => "audio/mp4",
            ".ogg" => "audio/ogg",
            _ => "audio/webm"
        };
    }

    private static string? NormalizeLanguage(string? lang)
    {
        if (string.IsNullOrWhiteSpace(lang) || lang.Equals("auto", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        if (lang.StartsWith("en", StringComparison.OrdinalIgnoreCase)) return "en";
        if (lang.StartsWith("zh", StringComparison.OrdinalIgnoreCase)) return "zh";

        // If it's something like "fr-FR" or "de"
        var dashIndex = lang.IndexOf('-');
        return dashIndex > 0 ? lang[..dashIndex] : lang;
    }

    private static string ExtractErrorMessage(string responseBody, System.Net.HttpStatusCode statusCode)
    {
        try
        {
            using var doc = JsonDocument.Parse(responseBody);
            if (doc.RootElement.TryGetProperty("error", out var errorObj))
            {
                if (errorObj.TryGetProperty("message", out var msgProp))
                {
                    return msgProp.GetString() ?? $"HTTP {(int)statusCode}";
                }
            }
        }
        catch
        {
            // Fallback to raw text snippet
        }

        return !string.IsNullOrWhiteSpace(responseBody)
            ? (responseBody.Length > 150 ? responseBody[..150] + "..." : responseBody)
            : $"HTTP {(int)statusCode}";
    }
}
