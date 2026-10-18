using LiveConversation.Web.Models;

namespace LiveConversation.Web.Services.Abstractions;

public interface ITtsProvider
{
    string ProviderName { get; }
    
    /// <summary>
    /// Synthesizes a complete sentence or phrase into MP3 audio bytes.
    /// </summary>
    Task<byte[]> SynthesizeAsync(
        string text, 
        VoiceProfile profile, 
        string? apiKeyOverride = null, 
        CancellationToken ct = default);
}
