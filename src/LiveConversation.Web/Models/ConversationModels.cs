namespace LiveConversation.Web.Models;

public record SimpleChatMessage(
    string Role, 
    string Content
);

public record UserSpeechRequest(
    string Text,
    string CountryCode,
    string SceneId
);

public record AudioSentencePayload(
    int SentenceIndex,
    string Text,
    string AudioBase64,
    string MimeType = "audio/mpeg",
    bool IsLast = false
);

public class CoachFeedback
{
    public required string OriginalText { get; set; }
    public string? CorrectedText { get; set; }
    public string? NativeAlternative { get; set; }
    public string? Explanation { get; set; }
    public string? VocabularyHighlight { get; set; }
    public bool HasIssues { get; set; }
}

public class ClientSettings
{
    public string? TtsProvider { get; set; } // "ElevenLabs" or "EdgeTTS"
    public string? ElevenLabsApiKey { get; set; }
    public string? LlmApiKey { get; set; }
    public string? LlmEndpoint { get; set; }
    public string? LlmModel { get; set; }
    public float SpeakingRate { get; set; } = 1.0f;
}
