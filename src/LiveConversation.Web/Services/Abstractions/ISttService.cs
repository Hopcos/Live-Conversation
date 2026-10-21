using LiveConversation.Web.Models;

namespace LiveConversation.Web.Services.Abstractions;

public interface ISttService
{
    string ProviderName { get; }

    /// <summary>
    /// Transcribes the given audio bytes to text using Whisper API.
    /// </summary>
    Task<string> TranscribeAsync(
        byte[] audioBytes, 
        string fileName, 
        ClientSettings? settings, 
        string? language = null, 
        CancellationToken ct = default);
}
