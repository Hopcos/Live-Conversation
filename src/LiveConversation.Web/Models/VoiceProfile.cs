namespace LiveConversation.Web.Models;

public record VoiceProfile(
    string CountryCode,
    string AccentName,
    string VoiceId,
    string ProviderName,
    float Rate = 1.0f,
    float Pitch = 1.0f,
    string? ModelId = null
);
