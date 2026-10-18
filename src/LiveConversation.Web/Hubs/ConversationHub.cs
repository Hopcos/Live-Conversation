using System.Collections.Concurrent;
using System.Text;
using LiveConversation.Web.Common;
using LiveConversation.Web.Models;
using LiveConversation.Web.Services.Abstractions;
using LiveConversation.Web.Services.Personas;
using LiveConversation.Web.Services.Tts;
using Microsoft.AspNetCore.SignalR;

namespace LiveConversation.Web.Hubs;

public class ConversationHub : Hub
{
    private readonly ILlmService _llmService;
    private readonly ICoachService _coachService;
    private readonly TtsProviderFactory _ttsFactory;
    private readonly ILogger<ConversationHub> _logger;

    // In-memory conversation state per connection
    private static readonly ConcurrentDictionary<string, List<SimpleChatMessage>> SessionHistories = new();
    private static readonly ConcurrentDictionary<string, CancellationTokenSource> ActiveTokens = new();

    public ConversationHub(
        ILlmService llmService,
        ICoachService coachService,
        TtsProviderFactory ttsFactory,
        ILogger<ConversationHub> logger)
    {
        _llmService = llmService;
        _coachService = coachService;
        _ttsFactory = ttsFactory;
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

        // Synthesize initial greeting
        var greeting = scenario.InitialGreeting;
        history.Add(new SimpleChatMessage("assistant", greeting));

        await Clients.Caller.SendAsync("ReceiveTextChunk", greeting);

        _ = Task.Run(async () =>
        {
            try
            {
                var ttsProvider = _ttsFactory.GetProvider(settings?.TtsProvider);
                var voiceProfile = GetVoiceProfile(persona, ttsProvider.ProviderName, settings);
                var audioBytes = await ttsProvider.SynthesizeAsync(greeting, voiceProfile, settings?.ElevenLabsApiKey);
                var base64 = Convert.ToBase64String(audioBytes);

                await Clients.Client(connectionId).SendAsync("ReceiveSentenceAudio", new AudioSentencePayload(
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

        // 1. Kick off asynchronous background coaching analysis (Shadow Coach)
        _ = Task.Run(async () =>
        {
            try
            {
                var contextSummary = string.Join(" | ", history.TakeLast(3).Select(m => $"{m.Role}: {m.Content}"));
                var feedback = await _coachService.AnalyzeSpeechAsync(userText, contextSummary, settings);
                if (feedback != null)
                {
                    await Clients.Client(connectionId).SendAsync("ReceiveCoachFeedback", feedback);
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
                Remember: Keep your response natural, conversational, and within 1-3 spoken sentences. 
                Do NOT output markdown, bullet points, emoji, or parenthetical cues.
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
                    await SynthesizeAndSendSentenceAsync(connectionId, ttsProvider, sentence, currentIndex, voiceProfile, settings, false, ct);
                }
            }

            // Flush remaining text
            if (!ct.IsCancellationRequested && segmenter.Flush() is { } remainingSentence)
            {
                var currentIndex = sentenceIndex++;
                await SynthesizeAndSendSentenceAsync(connectionId, ttsProvider, remainingSentence, currentIndex, voiceProfile, settings, true, ct);
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
    public async Task<string?> TestTts(string text, string engine, string voiceId, string? apiKey)
    {
        try
        {
            var provider = _ttsFactory.GetProvider(engine);
            var profile = new VoiceProfile("US", "Test", voiceId, engine);
            var audioBytes = await provider.SynthesizeAsync(text, profile, apiKey);
            return Convert.ToBase64String(audioBytes);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Test TTS failed: {Message}", ex.Message);
            throw new HubException($"TTS Error: {ex.Message}");
        }
    }

    private async Task SynthesizeAndSendSentenceAsync(
        string connectionId,
        ITtsProvider provider,
        string sentence,
        int index,
        VoiceProfile profile,
        ClientSettings? settings,
        bool isLast,
        CancellationToken ct)
    {
        try
        {
            var audioBytes = await provider.SynthesizeAsync(sentence, profile, settings?.ElevenLabsApiKey, ct);
            var base64 = Convert.ToBase64String(audioBytes);

            await Clients.Client(connectionId).SendAsync("ReceiveSentenceAudio", new AudioSentencePayload(
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
            Rate: rate
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
