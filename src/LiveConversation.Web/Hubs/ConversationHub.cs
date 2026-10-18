using System.Collections.Concurrent;
using System.Text;
using LiveConversation.Web.Common;
using LiveConversation.Web.Models;
using LiveConversation.Web.Services.Abstractions;
using LiveConversation.Web.Services.Personas;
using LiveConversation.Web.Services.Tts;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;

namespace LiveConversation.Web.Hubs;

public class ConversationHub : Hub
{
    private readonly ILlmService _llmService;
    private readonly ICoachService _coachService;
    private readonly TtsProviderFactory _ttsFactory;
    private readonly AppSettings _appSettings;
    private readonly IHubContext<ConversationHub> _hubContext;
    private readonly ILogger<ConversationHub> _logger;

    // In-memory conversation state per connection
    private static readonly ConcurrentDictionary<string, List<SimpleChatMessage>> SessionHistories = new();
    private static readonly ConcurrentDictionary<string, CancellationTokenSource> ActiveTokens = new();

    public ConversationHub(
        ILlmService llmService,
        ICoachService coachService,
        TtsProviderFactory ttsFactory,
        IOptions<AppSettings> appSettings,
        IHubContext<ConversationHub> hubContext,
        ILogger<ConversationHub> logger)
    {
        _llmService = llmService;
        _coachService = coachService;
        _ttsFactory = ttsFactory;
        _appSettings = appSettings.Value;
        _hubContext = hubContext;
        _logger = logger;
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        var connectionId = Context.ConnectionId;
        CancelActiveTask(connectionId);
        SessionHistories.TryRemove(connectionId, out _);
        return base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Initializes or resets the conversation session for a country and scenario.
    /// </summary>
    public async Task InitSession(string countryCode, string sceneId, ClientSettings? settings)
    {
        var connectionId = Context.ConnectionId;
        CancelActiveTask(connectionId);

        var persona = PersonaRegistry.GetPersona(countryCode);
        var scenario = PersonaRegistry.GetScenario(sceneId);

        var history = new List<SimpleChatMessage>();
        SessionHistories[connectionId] = history;

        // Send session metadata to client
        await Clients.Caller.SendAsync("SessionInitialized", new
        {
            Persona = persona,
            Scenario = scenario,
            ActiveTtsProvider = settings?.TtsProvider ?? "EdgeTTS"
        });

        // Synthesize initial greeting with persona's regional spoken flavor
        var greeting = persona.InitialGreeting ?? scenario.InitialGreeting;
        history.Add(new SimpleChatMessage("assistant", greeting));

        await Clients.Caller.SendAsync("ReceiveTextChunk", greeting);

        _ = Task.Run(async () =>
        {
            try
            {
                var ttsProvider = _ttsFactory.GetProvider(settings?.TtsProvider);
                var voiceProfile = GetVoiceProfile(persona, ttsProvider.ProviderName, settings);
                byte[] audioBytes = [];
                var isWebSpeech = settings?.TtsProvider?.Equals("WebSpeech", StringComparison.OrdinalIgnoreCase) == true;

                if (!isWebSpeech)
                {
                    try
                    {
                        var key = ttsProvider.ProviderName.Equals("OpenAITTS", StringComparison.OrdinalIgnoreCase)
                            ? settings?.LlmApiKey
                            : settings?.ElevenLabsApiKey;
                        audioBytes = await ttsProvider.SynthesizeAsync(greeting, voiceProfile, key);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Primary TTS failed for greeting. Falling back to EdgeTTS.");
                        try
                        {
                            var fallbackProvider = _ttsFactory.GetProvider("EdgeTTS");
                            var fallbackProfile = voiceProfile with { ProviderName = "EdgeTTS", VoiceId = persona.EdgeTtsVoiceName };
                            audioBytes = await fallbackProvider.SynthesizeAsync(greeting, fallbackProfile, null);
                        }
                        catch (Exception fallbackEx)
                        {
                            _logger.LogWarning(fallbackEx, "Fallback EdgeTTS also failed. Emitting empty audio for browser WebSpeech fallback.");
                            audioBytes = [];
                        }
                    }
                }

                var base64 = audioBytes.Length > 0 ? Convert.ToBase64String(audioBytes) : string.Empty;

                await _hubContext.Clients.Client(connectionId).SendAsync("ReceiveSentenceAudio", new AudioSentencePayload(
                    SentenceIndex: 0,
                    Text: greeting,
                    AudioBase64: base64,
                    IsLast: true
                ));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to synthesize initial greeting: {Message}", ex.Message);
            }
            finally
            {
                await _hubContext.Clients.Client(connectionId).SendAsync("AiTurnCompleted");
            }
        });
    }

    /// <summary>
    /// User sends their spoken transcript or typed text.
    /// </summary>
    public async Task SendUserMessage(string userText, string countryCode, string sceneId, ClientSettings? settings)
    {
        if (string.IsNullOrWhiteSpace(userText)) return;

        var connectionId = Context.ConnectionId;
        CancelActiveTask(connectionId);

        var cts = new CancellationTokenSource();
        ActiveTokens[connectionId] = cts;
        var ct = cts.Token;

        var persona = PersonaRegistry.GetPersona(countryCode);
        var scenario = PersonaRegistry.GetScenario(sceneId);

        if (!SessionHistories.TryGetValue(connectionId, out var history))
        {
            history = [];
            SessionHistories[connectionId] = history;
        }

        // Add user turn to conversation history
        history.Add(new SimpleChatMessage("user", userText));

        // 1. Kick off asynchronous background coaching analysis (Shadow Coach) using isolated context snapshot
        var contextSummary = string.Join(" | ", history.TakeLast(3).Select(m => $"{m.Role}: {m.Content}"));
        _ = Task.Run(async () =>
        {
            try
            {
                var feedback = await _coachService.AnalyzeSpeechAsync(userText, contextSummary, settings);
                if (feedback != null)
                {
                    await _hubContext.Clients.Client(connectionId).SendAsync("ReceiveCoachFeedback", feedback);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error running shadow coach feedback: {Message}", ex.Message);
            }
        });

        // 2. Main Spoken Pipeline: LLM Streaming + Sentence Chunking + TTS
        try
        {
            var systemPrompt = $"""
                {persona.SystemPrompt}
                Scenario: {scenario.ContextPrompt}
                
                ORAL CONVERSATION & ACCENT GUIDELINES:
                - Embody your persona's spoken dialect and regional oral accent habits ({persona.AccentDescription}) authentically.
                - You MUST naturally incorporate your persona's distinct regional oral vocabulary, idioms, contractions, and spoken pacing in EVERY turn.
                - Keep your turns strictly within 1 to 3 spoken sentences so the learner has ample opportunity to practice.
                - End with a friendly, natural follow-up question.
                - NEVER output markdown formatting (like asterisks, bolding, bullet points), emojis, or parenthetical cues. Output ONLY direct spoken words.
                """;

            var segmenter = new SentenceSegmenter();
            var ttsProvider = _ttsFactory.GetProvider(settings?.TtsProvider);
            var voiceProfile = GetVoiceProfile(persona, ttsProvider.ProviderName, settings);

            int sentenceIndex = 0;
            var completeAssistantReply = new StringBuilder();

            await foreach (var token in _llmService.StreamCompletionAsync(history, systemPrompt, settings, ct))
            {
                if (ct.IsCancellationRequested) break;

                completeAssistantReply.Append(token);
                await Clients.Caller.SendAsync("ReceiveTextChunk", token, ct);

                segmenter.Append(token);
                while (segmenter.TryExtractNextSentence() is { } sentence)
                {
                    if (ct.IsCancellationRequested) break;

                    var currentIndex = sentenceIndex++;
                    await SynthesizeAndSendSentenceAsync(connectionId, ttsProvider, sentence, currentIndex, voiceProfile, persona, settings, false, ct);
                }
            }

            // Flush remaining text
            if (!ct.IsCancellationRequested && segmenter.Flush() is { } remainingSentence)
            {
                var currentIndex = sentenceIndex++;
                await SynthesizeAndSendSentenceAsync(connectionId, ttsProvider, remainingSentence, currentIndex, voiceProfile, persona, settings, true, ct);
            }

            if (!ct.IsCancellationRequested)
            {
                history.Add(new SimpleChatMessage("assistant", completeAssistantReply.ToString()));
                await Clients.Caller.SendAsync("AiTurnCompleted", ct);
            }
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("Conversation turn for {ConnectionId} was interrupted by user.", connectionId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing conversation turn: {Message}", ex.Message);
            await Clients.Caller.SendAsync("ReceiveError", $"Dialogue Error: {ex.Message}");
        }
    }

    /// <summary>
    /// User interrupted AI speech (barge-in).
    /// </summary>
    public async Task Interrupt()
    {
        var connectionId = Context.ConnectionId;
        CancelActiveTask(connectionId);
        await Clients.Caller.SendAsync("ConversationInterrupted");
    }

    /// <summary>
    /// Test TTS synthesis for settings preview.
    /// </summary>
    public async Task<string?> TestTts(string text, string engine, string voiceId, string? apiKey, string? modelId = null)
    {
        try
        {
            if (string.Equals(engine, "WebSpeech", StringComparison.OrdinalIgnoreCase))
            {
                // WebSpeech is executed client-side in the browser
                return string.Empty;
            }

            var provider = _ttsFactory.GetProvider(engine);
            var profile = new VoiceProfile("US", "Test", voiceId, engine, ModelId: modelId);
            var effectiveKey = engine.Equals("OpenAITTS", StringComparison.OrdinalIgnoreCase)
                ? (!string.IsNullOrWhiteSpace(apiKey) ? apiKey : _appSettings.Llm.ApiKey)
                : apiKey;

            var audioBytes = await provider.SynthesizeAsync(text, profile, effectiveKey);
            return Convert.ToBase64String(audioBytes);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Test TTS failed: {Message}", ex.Message);
            throw new HubException(ex.Message);
        }
    }

    private async Task SynthesizeAndSendSentenceAsync(
        string connectionId,
        ITtsProvider provider,
        string sentence,
        int index,
        VoiceProfile profile,
        PersonaConfig persona,
        ClientSettings? settings,
        bool isLast,
        CancellationToken ct)
    {
        try
        {
            byte[] audioBytes = [];
            var isWebSpeech = settings?.TtsProvider?.Equals("WebSpeech", StringComparison.OrdinalIgnoreCase) == true;

            if (!isWebSpeech)
            {
                try
                {
                    var apiKey = provider.ProviderName.Equals("OpenAITTS", StringComparison.OrdinalIgnoreCase)
                        ? settings?.LlmApiKey
                        : settings?.ElevenLabsApiKey;
                    audioBytes = await provider.SynthesizeAsync(sentence, profile, apiKey, ct);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Primary TTS synthesis failed for '{Sentence}'. Falling back to EdgeTTS.", sentence);
                    try
                    {
                        var fallbackProvider = _ttsFactory.GetProvider("EdgeTTS");
                        var fallbackProfile = profile with { ProviderName = "EdgeTTS", VoiceId = persona.EdgeTtsVoiceName };
                        audioBytes = await fallbackProvider.SynthesizeAsync(sentence, fallbackProfile, null, ct);
                    }
                    catch (Exception fallbackEx)
                    {
                        _logger.LogWarning(fallbackEx, "Fallback EdgeTTS failed as well. Emitting empty audio for browser WebSpeech fallback.");
                        audioBytes = [];
                    }
                }
            }

            var base64 = audioBytes.Length > 0 ? Convert.ToBase64String(audioBytes) : string.Empty;

            await _hubContext.Clients.Client(connectionId).SendAsync("ReceiveSentenceAudio", new AudioSentencePayload(
                SentenceIndex: index,
                Text: sentence,
                AudioBase64: base64,
                IsLast: isLast
            ), ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to synthesize sentence '{Sentence}': {Message}", sentence, ex.Message);
        }
    }

    private static VoiceProfile GetVoiceProfile(PersonaConfig persona, string providerName, ClientSettings? settings)
    {
        var isElevenLabs = providerName.Equals("ElevenLabs", StringComparison.OrdinalIgnoreCase);
        var voiceId = isElevenLabs ? persona.ElevenLabsVoiceId : persona.EdgeTtsVoiceName;
        var rate = settings?.SpeakingRate ?? 1.0f;

        return new VoiceProfile(
            CountryCode: persona.CountryCode,
            AccentName: persona.AccentDescription,
            VoiceId: voiceId,
            ProviderName: providerName,
            Rate: rate,
            ModelId: isElevenLabs ? settings?.ElevenLabsModelId : null
        );
    }

    private void CancelActiveTask(string connectionId)
    {
        if (ActiveTokens.TryRemove(connectionId, out var existingCts))
        {
            try
            {
                existingCts.Cancel();
                existingCts.Dispose();
            }
            catch { /* ignore */ }
        }
    }
}
