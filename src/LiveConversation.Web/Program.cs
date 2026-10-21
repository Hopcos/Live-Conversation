using LiveConversation.Web.Hubs;
using LiveConversation.Web.Models;
using LiveConversation.Web.Services.Abstractions;
using LiveConversation.Web.Services.Llm;
using LiveConversation.Web.Services.Personas;
using LiveConversation.Web.Services.Stt;
using LiveConversation.Web.Services.Tts;

var builder = WebApplication.CreateBuilder(args);

// 1. Bind Strongly-typed AppSettings
builder.Services.Configure<AppSettings>(builder.Configuration.GetSection("AppSettings"));

// 2. Register SignalR & HTTP Client
builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = true;
    options.MaximumReceiveMessageSize = 10 * 1024 * 1024; // 10MB buffer for audio uploads
});
builder.Services.AddHttpClient();

// 3. Register TTS Providers & Factory
builder.Services.AddSingleton<ITtsProvider, ElevenLabsTtsProvider>();
builder.Services.AddSingleton<ITtsProvider, EdgeTtsProvider>();
builder.Services.AddSingleton<ITtsProvider, OpenAiTtsProvider>();
builder.Services.AddSingleton<TtsProviderFactory>();

// 4. Register STT Service
builder.Services.AddSingleton<ISttService, WhisperSttService>();

// 5. Register LLM and Shadow Coach
builder.Services.AddSingleton<ILlmService, OpenAiLlmService>();
builder.Services.AddSingleton<ICoachService, ShadowCoachService>();

// 6. CORS for development flexibility
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();

// REST Endpoints for initial data loading
app.MapGet("/api/personas", () => Results.Ok(PersonaRegistry.Personas));
app.MapGet("/api/scenarios", () => Results.Ok(PersonaRegistry.Scenarios));
app.MapGet("/api/config", (IConfiguration config) =>
{
    var appSettings = config.GetSection("AppSettings").Get<AppSettings>() ?? new AppSettings();
    return Results.Ok(new
    {
        TtsProvider = appSettings.Tts.ActiveProvider,
        SttProvider = appSettings.Stt.ActiveProvider,
        LlmModel = appSettings.Llm.ModelId,
        LlmEndpoint = appSettings.Llm.Endpoint,
        WhisperModel = appSettings.Whisper.ModelId,
        WhisperEndpoint = appSettings.Whisper.Endpoint,
        ElevenLabsModel = appSettings.ElevenLabs.ModelId,
        HasElevenLabsKey = !string.IsNullOrWhiteSpace(appSettings.ElevenLabs.ApiKey),
        HasLlmKey = !string.IsNullOrWhiteSpace(appSettings.Llm.ApiKey),
        HasWhisperKey = !string.IsNullOrWhiteSpace(appSettings.Whisper.ApiKey) || !string.IsNullOrWhiteSpace(appSettings.Llm.ApiKey)
    });
});

// Map Real-time Conversation SignalR Hub
app.MapHub<ConversationHub>("/hubs/conversation");

app.Run();
