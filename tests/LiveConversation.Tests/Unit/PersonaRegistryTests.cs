using LiveConversation.Web.Services.Personas;

namespace LiveConversation.Tests.Unit;

public class PersonaRegistryTests
{
    [Fact]
    public void PersonaRegistry_ContainsExpectedCountries()
    {
        var personas = PersonaRegistry.Personas;
        Assert.NotEmpty(personas);
        
        var countryCodes = personas.Select(p => p.CountryCode).ToList();
        Assert.Contains("US", countryCodes);
        Assert.Contains("UK", countryCodes);
        Assert.Contains("AU", countryCodes);
        Assert.Contains("IN", countryCodes);
        Assert.Contains("CA", countryCodes);
        Assert.Contains("RO", countryCodes);
        Assert.Contains("UA", countryCodes);
        Assert.Contains("CN", countryCodes);
    }

    [Theory]
    [InlineData("US", "Rachel Vance", "en-US-JennyNeural")]
    [InlineData("UK", "Arthur Pendelton", "en-GB-RyanNeural")]
    [InlineData("AU", "Liam O'Connor", "en-AU-WilliamNeural")]
    [InlineData("IN", "Priya Sharma", "en-IN-NeerjaNeural")]
    [InlineData("CA", "Chloe Tremblay", "en-CA-ClaraNeural")]
    [InlineData("RO", "Elena Radu", "en-IE-EmilyNeural")]
    [InlineData("UA", "Oksana Kovalenko", "en-GB-SoniaNeural")]
    [InlineData("CN", "Lin Wei (林薇)", "zh-CN-XiaoxiaoNeural")]
    public void GetPersona_KnownCountry_ReturnsCorrectPersonaAndVoiceMapping(
        string countryCode, 
        string expectedName, 
        string expectedEdgeVoice)
    {
        var persona = PersonaRegistry.GetPersona(countryCode);

        Assert.NotNull(persona);
        Assert.Equal(expectedName, persona.Name);
        Assert.Equal(expectedEdgeVoice, persona.EdgeTtsVoiceName);
        Assert.False(string.IsNullOrWhiteSpace(persona.ElevenLabsVoiceId));
        Assert.False(string.IsNullOrWhiteSpace(persona.SystemPrompt));
        Assert.False(string.IsNullOrWhiteSpace(persona.InitialGreeting));
    }

    [Fact]
    public void GetPersona_UnknownCountry_FallsBackToUS()
    {
        var persona = PersonaRegistry.GetPersona("NON_EXISTENT");

        Assert.NotNull(persona);
        Assert.Equal("US", persona.CountryCode);
        Assert.Equal("Rachel Vance", persona.Name);
    }

    [Theory]
    [InlineData("daily-chat", "Casual Coffee Chat")]
    [InlineData("job-interview", "Job Interview Practice")]
    [InlineData("ielts-speaking", "IELTS Speaking Prep")]
    [InlineData("travel-airport", "Travel & Hotel Check-in")]
    [InlineData("tech-discussion", "Tech & Product Standup")]
    public void GetScenario_KnownId_ReturnsCorrectScenario(string scenarioId, string expectedTitle)
    {
        var scenario = PersonaRegistry.GetScenario(scenarioId);

        Assert.NotNull(scenario);
        Assert.Equal(expectedTitle, scenario.Title);
        Assert.False(string.IsNullOrWhiteSpace(scenario.InitialGreeting));
    }

    [Fact]
    public void GetScenarioGreeting_DifferentScenarios_ReturnDistinctGreetingsForSamePersona()
    {
        var persona = PersonaRegistry.GetPersona("US");
        var chatScenario = PersonaRegistry.GetScenario("daily-chat");
        var interviewScenario = PersonaRegistry.GetScenario("job-interview");
        var ieltsScenario = PersonaRegistry.GetScenario("ielts-speaking");

        var chatGreeting = PersonaRegistry.GetScenarioGreeting(persona, chatScenario);
        var interviewGreeting = PersonaRegistry.GetScenarioGreeting(persona, interviewScenario);
        var ieltsGreeting = PersonaRegistry.GetScenarioGreeting(persona, ieltsScenario);

        Assert.NotEmpty(chatGreeting);
        Assert.NotEmpty(interviewGreeting);
        Assert.NotEmpty(ieltsGreeting);
        Assert.NotEqual(chatGreeting, interviewGreeting);
        Assert.NotEqual(interviewGreeting, ieltsGreeting);
        Assert.Contains("interview", interviewGreeting, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("IELTS", ieltsGreeting, StringComparison.OrdinalIgnoreCase);
    }
}
