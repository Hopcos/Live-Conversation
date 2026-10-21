namespace LiveConversation.Web.Models;

public class PersonaConfig
{
    public required string Id { get; set; }
    public required string CountryCode { get; set; } // "US", "UK", "AU", "IN", "CA"
    public required string CountryName { get; set; }
    public required string FlagEmoji { get; set; }
    public required string Name { get; set; }
    public required string Title { get; set; }
    public required string AccentDescription { get; set; }
    public required string ElevenLabsVoiceId { get; set; }
    public required string EdgeTtsVoiceName { get; set; }
    public required string SystemPrompt { get; set; }
    public string[] SuggestedTopics { get; set; } = [];
    public string? InitialGreeting { get; set; }
}

public class ScenarioConfig
{
    public required string Id { get; set; }
    public required string Title { get; set; }
    public required string Icon { get; set; }
    public required string Description { get; set; }
    public required string ContextPrompt { get; set; }
    public string InitialGreeting { get; set; } = "Hello! How can I help you today?";
    public string[] SuggestedTopics { get; set; } = [];
}
