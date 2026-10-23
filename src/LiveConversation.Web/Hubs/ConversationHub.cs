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
    private readonly ISttService _sttService;
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
        ISttService sttService,
        IOptions<AppSettings> appSettings,
        IHubContext<ConversationHub> hubContext,
        ILogger<ConversationHub> logger)
    {
        _llmService = llmService;
        _coachService = coachService;
        _ttsFactory = ttsFactory;
        _sttService = sttService;
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
            AllPersonas = PersonaRegistry.Personas,
            AllScenarios = PersonaRegistry.Scenarios,
            ActiveTtsProvider = settings?.TtsProvider ?? "EdgeTTS",
            ActiveSttProvider = settings?.SttProvider ?? "WebSpeech"
        });

        // Synthesize scenario greeting with persona's regional spoken flavor
        var greeting = PersonaRegistry.GetScenarioGreeting(persona, scenario);
        history.Add(new SimpleChatMessage("assistant", greeting));

        await Clients.Caller.SendAsync("ReceiveTextChunk", greeting);

        _ = Task.Run(async () =>
        {
            try
            {
                var ttsProvider = _ttsFactory.GetProvider(settings?.TtsProvider);
                var voiceProfile = GetVoiceProfile(persona, ttsProvider.ProviderName, settings);
                byte[] audioBytes = [];
                var effectiveProviderName = ttsProvider.ProviderName;
                var isWebSpeech = effectiveProviderName.Equals("WebSpeech", StringComparison.OrdinalIgnoreCase)
                    || settings?.TtsProvider?.Equals("WebSpeech", StringComparison.OrdinalIgnoreCase) == true;

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

        await ExecuteUserTurnAsync(userText, countryCode, sceneId, settings, connectionId, ct);
    }

    /// <summary>
    /// User sends recorded audio (e.g. from Whisper mode).
    /// Audio is transcribed via Whisper STT and then fed into the conversation & coaching pipeline.
    /// </summary>
    public async Task SendUserAudio(string audioBase64, string mimeType, string countryCode, string sceneId, ClientSettings? settings)
    {
        if (string.IsNullOrWhiteSpace(audioBase64)) return;

        var connectionId = Context.ConnectionId;
        CancelActiveTask(connectionId);

        var cts = new CancellationTokenSource();
        ActiveTokens[connectionId] = cts;
        var ct = cts.Token;

        try
        {
            var audioBytes = Convert.FromBase64String(audioBase64);
            var extension = mimeType.Contains("wav", StringComparison.OrdinalIgnoreCase) ? "wav" 
                : (mimeType.Contains("mp4", StringComparison.OrdinalIgnoreCase) ? "m4a" : "webm");
            var fileName = $"user_audio_{Guid.NewGuid():N}.{extension}";

            var userText = await _sttService.TranscribeAsync(audioBytes, fileName, settings, settings?.SttLanguage, ct);
            if (string.IsNullOrWhiteSpace(userText))
            {
                await Clients.Caller.SendAsync("ReceiveUserTranscript", string.Empty);
                return;
            }

            // Broadcast recognized text to client so it renders the user message bubble
            await Clients.Caller.SendAsync("ReceiveUserTranscript", userText);

            // Execute conversation pipeline
            await ExecuteUserTurnAsync(userText, countryCode, sceneId, settings, connectionId, ct);
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("Whisper turn for {ConnectionId} was interrupted by user.", connectionId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing audio STT turn: {Message}", ex.Message);
            await Clients.Caller.SendAsync("ReceiveError", $"Whisper STT Error: {ex.Message}");
        }
    }

    private async Task ExecuteUserTurnAsync(
        string userText, 
        string countryCode, 
        string sceneId, 
        ClientSettings? settings, 
        string connectionId, 
        CancellationToken ct)
    {
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
                var feedback = await _coachService.AnalyzeSpeechAsync(userText, contextSummary, settings, countryCode);
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
                === ROLEPLAY SCENARIO DIRECTIVE ===
                You are currently roleplaying in the following scenario:
                SCENARIO: [{scenario.Title}]
                SCENARIO SETTING & CONTEXT:
                {scenario.ContextPrompt}
                
                YOUR ACTIVE ROLE IN THIS SCENARIO:
                - If [{scenario.Id}] is 'job-interview': You are an experienced, professional job interviewer. Conduct a realistic job interview. Ask ONE focused behavioral or technical question at a time. Evaluate the user's responses, ask follow-up questions, and guide the interview.
                - If [{scenario.Id}] is 'ielts-speaking': You are an official IELTS Speaking Examiner. Strictly adhere to IELTS criteria (fluency, coherence, lexical resource, grammatical range). Probe with Part 1, Part 2, or Part 3 examiner questions.
                - If [{scenario.Id}] is 'travel-airport': You are an airline gate agent, immigration officer, or hotel concierge. Assist the user with check-in, tickets, directions, or travel dilemmas realistically.
                - If [{scenario.Id}] is 'tech-discussion': You are a senior software engineering teammate / tech lead in an agile daily standup. Discuss code, PRs, architecture trade-offs, sprint progress, and blockers.
                - If [{scenario.Id}] is 'daily-chat': You are a relaxed, friendly conversational partner chatting over coffee about life, hobbies, and weekend plans.
                
                === PERSONA & REGIONAL ACCENT IDENTITY ===
                You are {persona.Name}, {persona.Title}.
                {persona.SystemPrompt}
                
                === MANDATORY ACCENT & SPOKEN RULES ===
                1. STAY DEEPLY IN YOUR SCENARIO ROLE ({scenario.Title}) in every single turn.
                2. AUTHENTIC REGIONAL ORAL ACCENT: Express all speech with {persona.Name}'s native regional accent markers, dialect vocabulary, contractions, and natural cadence ({persona.AccentDescription}).
                3. CONCISE ORAL TURNS: Keep responses strictly between 1 to 3 spoken sentences so the learner has maximum speaking time.
                4. CONVERSATIONAL QUESTION: Always end your turn with a relevant, engaging question advancing the scenario.
                5. PURE SPOKEN DIALOGUE ONLY: Output ONLY direct spoken words. Absolutely NO markdown formatting (*, **, #), NO bullet points, NO emojis, and NO parenthetical cues/stage directions.
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
