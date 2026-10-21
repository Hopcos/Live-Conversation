namespace LiveConversation.Web.Models;

public class AppSettings
{
    public LlmOptions Llm { get; set; } = new();
    public ElevenLabsOptions ElevenLabs { get; set; } = new();
    public TtsOptions Tts { get; set; } = new();
    public SttOptions Stt { get; set; } = new();
    public WhisperOptions Whisper { get; set; } = new();
}

public class LlmOptions
{
    public string Provider { get; set; } = "OpenAI";
    public string ApiKey { get; set; } = "";
    public string? Endpoint { get; set; }
    public string ModelId { get; set; } = "gpt-4o-mini";
}

public class ElevenLabsOptions
{
    public string ApiKey { get; set; } = "";
    public string ModelId { get; set; } = "eleven_turbo_v2_5";
}

public class TtsOptions
{
    public string ActiveProvider { get; set; } = "EdgeTTS"; // Defaults to EdgeTTS so it works right out of the box even before API keys!
}

public class SttOptions
{
    public string ActiveProvider { get; set; } = "WebSpeech"; // "WebSpeech" or "Whisper"
}

public class WhisperOptions
{
    public string? Endpoint { get; set; }
    public string? ApiKey { get; set; }
    public string ModelId { get; set; } = "whisper-1";
}
