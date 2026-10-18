using LiveConversation.Web.Models;

namespace LiveConversation.Web.Services.Abstractions;

public interface ILlmService
{
    IAsyncEnumerable<string> StreamCompletionAsync(
        IEnumerable<SimpleChatMessage> history, 
        string systemPrompt, 
        ClientSettings? settings = null, 
        CancellationToken ct = default);
}
