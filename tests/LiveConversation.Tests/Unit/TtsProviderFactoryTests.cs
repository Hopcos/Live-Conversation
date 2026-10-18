using LiveConversation.Web.Models;
using LiveConversation.Web.Services.Abstractions;
using LiveConversation.Web.Services.Tts;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace LiveConversation.Tests.Unit;

public class TtsProviderFactoryTests
{
    private readonly TtsProviderFactory _factory;
    private readonly ITtsProvider _elevenLabsProvider;
    private readonly ITtsProvider _edgeTtsProvider;

    public TtsProviderFactoryTests()
    {
        var appSettings = new AppSettings
        {
            Tts = new TtsOptions { ActiveProvider = "EdgeTTS" },
            ElevenLabs = new ElevenLabsOptions { ApiKey = "test-key" }
        };
        var options = Options.Create(appSettings);

        var httpClient = new HttpClient();
        _elevenLabsProvider = new ElevenLabsTtsProvider(httpClient, options, NullLogger<ElevenLabsTtsProvider>.Instance);
        _edgeTtsProvider = new EdgeTtsProvider(NullLogger<EdgeTtsProvider>.Instance);

        var providers = new List<ITtsProvider> { _elevenLabsProvider, _edgeTtsProvider };
        _factory = new TtsProviderFactory(providers, options);
    }

    [Fact]
    public void GetProvider_ExplicitElevenLabs_ReturnsElevenLabsProvider()
    {
        var provider = _factory.GetProvider("ElevenLabs");

        Assert.NotNull(provider);
        Assert.Equal("ElevenLabs", provider.ProviderName);
    }

    [Fact]
    public void GetProvider_ExplicitEdgeTTS_ReturnsEdgeTtsProvider()
    {
        var provider = _factory.GetProvider("EdgeTTS");

        Assert.NotNull(provider);
        Assert.Equal("EdgeTTS", provider.ProviderName);
    }

    [Theory]
    [InlineData("elevenlabs")]
    [InlineData("ELEVENLABS")]
    [InlineData("edgetts")]
    [InlineData("EDGETTS")]
    public void GetProvider_CaseInsensitiveMatching_ResolvesSuccessfully(string inputName)
    {
        var provider = _factory.GetProvider(inputName);

        Assert.NotNull(provider);
        Assert.Equal(inputName, provider.ProviderName, ignoreCase: true);
    }

    [Fact]
    public void GetProvider_UnknownProvider_FallsBackToEdgeTts()
    {
        var provider = _factory.GetProvider("NonExistentTTS");

        Assert.NotNull(provider);
        Assert.Equal("EdgeTTS", provider.ProviderName);
    }

    [Fact]
    public void GetProvider_NullArgument_UsesConfiguredDefault()
    {
        var provider = _factory.GetProvider(null);

        Assert.NotNull(provider);
        Assert.Equal("EdgeTTS", provider.ProviderName);
    }
}
