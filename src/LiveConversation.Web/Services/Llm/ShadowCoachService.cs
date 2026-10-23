using System.ClientModel;
using System.Text.Json;
using LiveConversation.Web.Models;
using LiveConversation.Web.Services.Abstractions;
using Microsoft.Extensions.Options;
using OpenAI;
using OpenAI.Chat;

namespace LiveConversation.Web.Services.Llm;

public class ShadowCoachService : ICoachService
{
    private readonly AppSettings _appSettings;
    private readonly ILogger<ShadowCoachService> _logger;

    public ShadowCoachService(IOptions<AppSettings> appSettings, ILogger<ShadowCoachService> logger)
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

        var clientOptions = new OpenAIClientOptions();
        if (!string.IsNullOrWhiteSpace(endpoint))
        {
            clientOptions.Endpoint = new Uri(endpoint);
        }

        var credential = new ApiKeyCredential(string.IsNullOrWhiteSpace(apiKey) ? "dummy-key" : apiKey);
        return new ChatClient(string.IsNullOrWhiteSpace(model) ? "gpt-4o-mini" : model, credential, clientOptions);
    }

    public async Task<CoachFeedback?> AnalyzeSpeechAsync(
        string userText, 
        string conversationContext, 
        ClientSettings? settings = null, 
        string? countryCode = null, 
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(userText) || userText.Trim().Length < 2)
        {
            return null;
        }

        try
        {
            var chatClient = CreateChatClient(settings);

            // Detect whether user speech contains Chinese characters and whether current persona is pure Chinese (CN) or bilingual (CN-EN)
            var hasChinese = userText.Any(c => c >= 0x4E00 && c <= 0x9FA5);
            var isPureChinese = string.Equals(countryCode, "CN", StringComparison.OrdinalIgnoreCase);
            var isBilingual = string.Equals(countryCode, "CN-EN", StringComparison.OrdinalIgnoreCase);
            var isChineseSpeech = isPureChinese || (isBilingual && hasChinese) || (string.IsNullOrEmpty(countryCode) && hasChinese);

            string systemPrompt;
            if (isChineseSpeech)
            {
                var coachIntro = isPureChinese
                    ? "You are Zhang Wei (张伟), an articulate, supportive native Mandarin Chinese Speech & Conversation Coach."
                    : "You are Lin Wei (林薇), a supportive, patient bilingual (English/Chinese) AI Speech & Language Coach.";

                systemPrompt = coachIntro + """

                    The user spoke to you in Chinese (Mandarin).

                    TASK:
                    Analyze the user's spoken Chinese utterance for any speech-recognition typos, oral grammatical slips, inverted word order (倒装), or colloquial disfluencies.

                    STRICT REQUIREMENTS:
                    1. All suggestions MUST be in Chinese (Mandarin). Absolutely DO NOT translate the user's sentence into English!
                    2. "correctedText" MUST be the grammatically polished, natural Chinese sentence (规范通顺的中文修正，修复错别字、口语倒装与语病).
                    3. "nativeAlternative" MUST be a natural, casual, idiomatic native Chinese expression (母语级地道自然的日常中文口语表达).
                    4. "explanation" MUST be in Chinese explaining the corrections (针对口语错字、发音识别偏差、语序或表达习惯的中文解析).
                    5. "vocabularyHighlight" MUST be recommended natural Chinese phrases, idioms, or colloquial expressions.
                    6. If the user's Chinese sentence is already natural and error-free, set "hasIssues": false, and provide a polite, natural conversational alternative in "nativeAlternative".

                    Output format: MUST be pure, valid JSON with no markdown wrapping, matching this schema:
                    {
                      "hasIssues": boolean,
                      "correctedText": "规范流畅的中文修正表达",
                      "nativeAlternative": "地道自然的日常中文口语表达",
                      "explanation": "简短的中文纠偏与搭配解析",
                      "vocabularyHighlight": "推荐掌握的亮点词汇或成语/短语"
                    }
                    """;
            }
            else
            {
                systemPrompt = """
                    You are a bilingual (English/Chinese) AI Speech & Language Coach for English learners.
                    Analyze the user's spoken sentence from an English conversation.
                    Identify any grammatical mistakes, non-native phrasing, awkward prepositions, or opportunities for more natural/idiomatic expression.

                    Output format: MUST be pure, valid JSON with no markdown wrapping, matching this schema:
                    {
                      "hasIssues": boolean,
                      "correctedText": "grammatically corrected English sentence",
                      "nativeAlternative": "how a native speaker would say this casually and naturally",
                      "explanation": "简短的中文解析说明（针对时态、介词、词汇搭配等关键点）",
                      "vocabularyHighlight": "推荐掌握的地道表达或短语"
                    }

                    If the user's sentence is already natural and error-free, set "hasIssues": false, but still provide a native casual alternative in "nativeAlternative".
                    """;
            }

            var userPrompt = $"""
                Context: {conversationContext}
                User spoken utterance: "{userText}"
                """;

            var messages = new List<ChatMessage>
            {
                ChatMessage.CreateSystemMessage(systemPrompt),
                ChatMessage.CreateUserMessage(userPrompt)
            };

            ClientResult<ChatCompletion> completion;
            try
            {
                var options = new ChatCompletionOptions
                {
                    Temperature = 0.3f,
                    MaxOutputTokenCount = 1000,
                    ResponseFormat = ChatResponseFormat.CreateJsonObjectFormat()
                };
                completion = await chatClient.CompleteChatAsync(messages, options, ct);
            }
            catch (Exception ex)
            {
                _logger.LogInformation("JsonObjectFormat not supported by provider, retrying standard completion: {Message}", ex.Message);
                var fallbackOptions = new ChatCompletionOptions
                {
                    Temperature = 0.3f,
                    MaxOutputTokenCount = 1000
                };
                completion = await chatClient.CompleteChatAsync(messages, fallbackOptions, ct);
            }

            var rawText = string.Join("\n", completion.Value.Content.Select(c => c.Text)).Trim();
            if (string.IsNullOrWhiteSpace(rawText)) return null;

            // Extract the outermost JSON block
            var firstBrace = rawText.IndexOf('{');
            var lastBrace = rawText.LastIndexOf('}');
            if (firstBrace < 0 || lastBrace <= firstBrace)
            {
                _logger.LogWarning("No valid JSON structure found in coach response: {Raw}", rawText);
                return null;
            }

            var json = rawText.Substring(firstBrace, lastBrace - firstBrace + 1);

            var feedback = JsonSerializer.Deserialize<CoachFeedback>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (feedback != null)
            {
                feedback.OriginalText = userText;
                feedback.Language = isChineseSpeech ? "zh" : "en";
            }

            return feedback;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to analyze speech for coaching feedback: {Message}", ex.Message);
            return null;
        }
    }
}
