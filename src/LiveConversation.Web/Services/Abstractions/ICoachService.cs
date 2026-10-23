using LiveConversation.Web.Models;

namespace LiveConversation.Web.Services.Abstractions;

public interface ICoachService
{
    Task<CoachFeedback?> AnalyzeSpeechAsync(
        string userText, 
        string conversationContext, 
        ClientSettings? settings = null, 
        string? countryCode = null, 
        CancellationToken ct = default);
}
