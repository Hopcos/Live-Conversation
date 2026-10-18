using LiveConversation.Web.Models;
using LiveConversation.Web.Services.Abstractions;
using LiveConversation.Web.Services.Tts;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace LiveConversation.Tests.Integration;

public class TtsEngineIntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public TtsEngineIntegrationTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public void DependencyInjection_RegistersAllTtsProviders()
    {
        using var scope = _factory.Services.CreateScope();
        var providers = scope.ServiceProvider.GetServices<ITtsProvider>().ToList();

        Assert.NotNull(providers);
        Assert.True(providers.Count >= 3);
        Assert.Contains(providers, p => p.ProviderName == "ElevenLabs");
        Assert.Contains(providers, p => p.ProviderName == "EdgeTTS");
        Assert.Contains(providers, p => p.ProviderName == "OpenAITTS");
    }

    [Fact]
    public void DependencyInjection_ResolvesTtsProviderFactory()
    {
        using var scope = _factory.Services.CreateScope();
        var factory = scope.ServiceProvider.GetService<TtsProviderFactory>();

        Assert.NotNull(factory);

        var edgeProvider = factory.GetProvider("EdgeTTS");
        Assert.Equal("EdgeTTS", edgeProvider.ProviderName);

        var elevenLabsProvider = factory.GetProvider("ElevenLabs");
        Assert.Equal("ElevenLabs", elevenLabsProvider.ProviderName);

        var openAiProvider = factory.GetProvider("OpenAITTS");
        Assert.Equal("OpenAITTS", openAiProvider.ProviderName);
    }

    [Fact]
    public async Task ElevenLabsProvider_WithoutApiKey_ThrowsInvalidOperationException()
    {
        var emptyOptions = Microsoft.Extensions.Options.Options.Create(new AppSettings());
        var httpClient = new HttpClient();
        var provider = new ElevenLabsTtsProvider(httpClient, emptyOptions, Microsoft.Extensions.Logging.Abstractions.NullLogger<ElevenLabsTtsProvider>.Instance);
        var profile = new VoiceProfile("US", "Test Accent", "21m00Tcm4TlvDq8ikWAM", "ElevenLabs");

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            provider.SynthesizeAsync("Hello world", profile, apiKeyOverride: ""));
    }

    [Fact]
    public async Task OpenAiTtsProvider_WithoutApiKey_ThrowsInvalidOperationException()
    {
        using var scope = _factory.Services.CreateScope();
        var factory = scope.ServiceProvider.GetRequiredService<TtsProviderFactory>();
        var provider = factory.GetProvider("OpenAITTS");
        var profile = new VoiceProfile("US", "Test Accent", "alloy", "OpenAITTS");

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            provider.SynthesizeAsync("Hello world", profile, apiKeyOverride: ""));
    }
}
