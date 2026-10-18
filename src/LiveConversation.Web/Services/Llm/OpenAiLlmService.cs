using System.ClientModel;
using LiveConversation.Web.Models;
using LiveConversation.Web.Services.Abstractions;
using Microsoft.Extensions.Options;
using OpenAI;
using OpenAI.Chat;

namespace LiveConversation.Web.Services.Llm;

public class OpenAiLlmService : ILlmService
{
    private readonly AppSettings _appSettings;
    private readonly ILogger<OpenAiLlmService> _logger;

    public OpenAiLlmService(IOptions<AppSettings> appSettings, ILogger<OpenAiLlmService> logger)
    {
        _appSettings = appSettings.Value;
        _logger = logger;
    }

    private ChatClient CreateChatClient(ClientSettings? settings)
    {
        var apiKey = !string.IsNullOrWhiteSpace(settings?.LlmApiKey)
            ? settings.LlmApiKey
            : _appSettings.Llm.ApiKey;

        var endpoint = !string.IsNullOrWhiteSpace(settings?.LlmEndpoint)
            ? settings.LlmEndpoint
            : _appSettings.Llm.Endpoint;

        var model = !string.IsNullOrWhiteSpace(settings?.LlmModel)
            ? settings.LlmModel
            : _appSettings.Llm.ModelId;

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogWarning("No LLM API Key configured. Please configure in settings or appsettings.json.");
        }

        var clientOptions = new OpenAIClientOptions();
        if (!string.IsNullOrWhiteSpace(endpoint))
        {
            clientOptions.Endpoint = new Uri(endpoint);
        }

        var credential = new ApiKeyCredential(string.IsNullOrWhiteSpace(apiKey) ? "dummy-key" : apiKey);
        return new ChatClient(string.IsNullOrWhiteSpace(model) ? "gpt-4o-mini" : model, credential, clientOptions);
    }

    public async IAsyncEnumerable<string> StreamCompletionAsync(
        IEnumerable<SimpleChatMessage> history, 
        string systemPrompt, 
        ClientSettings? settings = null, 
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
    {
        var chatClient = CreateChatClient(settings);

        var messages = new List<ChatMessage>
        {
            ChatMessage.CreateSystemMessage(systemPrompt)
        };

        foreach (var msg in history)
        {
            if (msg.Role.Equals("user", StringComparison.OrdinalIgnoreCase))
            {
                messages.Add(ChatMessage.CreateUserMessage(msg.Content));
            }
            else
            {
                messages.Add(ChatMessage.CreateAssistantMessage(msg.Content));
            }
        }

        var options = new ChatCompletionOptions
        {
            Temperature = 0.7f,
            MaxOutputTokenCount = 200 // Keep spoken dialogue brisk and concise
        };

        var updates = chatClient.CompleteChatStreamingAsync(messages, options, ct);

        await foreach (var update in updates)
        {
            foreach (var part in update.ContentUpdate)
            {
                if (!string.IsNullOrEmpty(part.Text))
                {
                    yield return part.Text;
                }
            }
        }
    }
}
