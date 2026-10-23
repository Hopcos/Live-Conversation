using System.Net;
using System.Text.Json;
using LiveConversation.Web.Models;
using Microsoft.AspNetCore.Mvc.Testing;

namespace LiveConversation.Tests.Integration;

public class ApiEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public ApiEndpointsTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetPersonas_ReturnsSuccessAndAllPersonas()
    {
        var response = await _client.GetAsync("/api/personas");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var content = await response.Content.ReadAsStringAsync();
        var personas = JsonSerializer.Deserialize<List<PersonaConfig>>(content, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        Assert.NotNull(personas);
        Assert.NotEmpty(personas);
        Assert.Contains(personas, p => p.CountryCode == "US");
        Assert.Contains(personas, p => p.CountryCode == "UK");
        Assert.Contains(personas, p => p.CountryCode == "IN");
        Assert.Contains(personas, p => p.CountryCode == "CA");
        Assert.Contains(personas, p => p.CountryCode == "RO");
        Assert.Contains(personas, p => p.CountryCode == "UA");
        Assert.Contains(personas, p => p.CountryCode == "CN");
        Assert.Contains(personas, p => p.CountryCode == "CN-EN");
    }

    [Fact]
    public async Task GetScenarios_ReturnsSuccessAndAllScenarios()
    {
        var response = await _client.GetAsync("/api/scenarios");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var content = await response.Content.ReadAsStringAsync();
        var scenarios = JsonSerializer.Deserialize<List<ScenarioConfig>>(content, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        Assert.NotNull(scenarios);
        Assert.NotEmpty(scenarios);
        Assert.Contains(scenarios, s => s.Id == "daily-chat");
        Assert.Contains(scenarios, s => s.Id == "job-interview");
        Assert.Contains(scenarios, s => s.Id == "ielts-speaking");
    }

    [Fact]
    public async Task GetConfig_ReturnsCurrentRuntimeConfiguration()
    {
        var response = await _client.GetAsync("/api/config");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var content = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(content);
        var root = doc.RootElement;

        Assert.True(root.TryGetProperty("ttsProvider", out var providerElem));
        Assert.False(string.IsNullOrWhiteSpace(providerElem.GetString()));

        Assert.True(root.TryGetProperty("llmModel", out var modelElem));
        Assert.False(string.IsNullOrWhiteSpace(modelElem.GetString()));
    }

    [Fact]
    public async Task GetIndexHtml_ReturnsStaticLandingPage()
    {
        var response = await _client.GetAsync("/index.html");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);

        var html = await response.Content.ReadAsStringAsync();
        Assert.Contains("LiveConversation AI", html);
        Assert.Contains("visualizer-canvas", html);
        Assert.Contains("settings-modal", html);
    }
}
