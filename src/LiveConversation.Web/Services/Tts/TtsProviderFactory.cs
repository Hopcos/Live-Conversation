using LiveConversation.Web.Models;
using LiveConversation.Web.Services.Abstractions;
using Microsoft.Extensions.Options;

namespace LiveConversation.Web.Services.Tts;

public class TtsProviderFactory
{
    private readonly IEnumerable<ITtsProvider> _providers;
    private readonly AppSettings _appSettings;

    public TtsProviderFactory(IEnumerable<ITtsProvider> providers, IOptions<AppSettings> appSettings)
    {
        _providers = providers;
        _appSettings = appSettings.Value;
    }

    public ITtsProvider GetProvider(string? requestedProvider = null)
    {
        var targetName = !string.IsNullOrWhiteSpace(requestedProvider)
            ? requestedProvider
            : _appSettings.Tts.ActiveProvider;

        var provider = _providers.FirstOrDefault(p => 
            p.ProviderName.Equals(targetName, StringComparison.OrdinalIgnoreCase));

        if (provider != null)
        {
            return provider;
        }

        // Fallback to EdgeTTS if requested provider not found
        return _providers.FirstOrDefault(p => p.ProviderName.Equals("EdgeTTS", StringComparison.OrdinalIgnoreCase))
            ?? _providers.First();
    }
}
