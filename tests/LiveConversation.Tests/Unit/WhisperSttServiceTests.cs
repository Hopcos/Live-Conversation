using System.Net;
using System.Text;
using LiveConversation.Web.Models;
using LiveConversation.Web.Services.Stt;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace LiveConversation.Tests.Unit;

public class WhisperSttServiceTests
{
    private class MockHttpMessageHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _handler;

        public MockHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> handler)
        {
            _handler = handler;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return Task.FromResult(_handler(request));
        }
    }

    [Fact]
    public async Task TranscribeAsync_EmptyAudioBytes_ReturnsEmptyString()
    {
        var appSettings = Options.Create(new AppSettings());
        var service = new WhisperSttService(new HttpClient(), appSettings, NullLogger<WhisperSttService>.Instance);

        var result = await service.TranscribeAsync([], "audio.webm", new ClientSettings());

        Assert.Equal(string.Empty, result);
    }

    [Fact]
    public async Task TranscribeAsync_NoApiKeyProvided_ThrowsInvalidOperationException()
    {
        var appSettings = Options.Create(new AppSettings());
        var service = new WhisperSttService(new HttpClient(), appSettings, NullLogger<WhisperSttService>.Instance);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.TranscribeAsync(new byte[] { 1, 2, 3 }, "audio.webm", new ClientSettings()));
    }

    [Fact]
    public async Task TranscribeAsync_ValidRequest_ParsesTranscriptionSuccessfully()
    {
        HttpRequestMessage? capturedRequest = null;
        var handler = new MockHttpMessageHandler(req =>
        {
            capturedRequest = req;
            var json = "{\"text\": \"Hello world, this is a test.\"}";
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json")
            };
        });

        var client = new HttpClient(handler);
        var appSettings = Options.Create(new AppSettings
        {
            Llm = new LlmOptions { ApiKey = "fallback-key" }
        });
        var service = new WhisperSttService(client, appSettings, NullLogger<WhisperSttService>.Instance);

        var settings = new ClientSettings
        {
            WhisperApiKey = "my-whisper-key",
            WhisperEndpoint = "https://custom-whisper.example.com/v1",
            WhisperModel = "whisper-large-v3",
            SttLanguage = "en-US"
        };

        var result = await service.TranscribeAsync(new byte[] { 10, 20, 30 }, "recording.wav", settings);

        Assert.Equal("Hello world, this is a test.", result);
        Assert.NotNull(capturedRequest);
        Assert.Equal("https://custom-whisper.example.com/v1/audio/transcriptions", capturedRequest.RequestUri?.ToString());
        Assert.Equal("Bearer", capturedRequest.Headers.Authorization?.Scheme);
        Assert.Equal("my-whisper-key", capturedRequest.Headers.Authorization?.Parameter);
    }

    [Fact]
    public async Task TranscribeAsync_HttpError_ThrowsHttpRequestException()
    {
        var handler = new MockHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.Unauthorized)
        {
            Content = new StringContent("{\"error\": {\"message\": \"Incorrect API key\"}}", Encoding.UTF8, "application/json")
        });

        var client = new HttpClient(handler);
        var appSettings = Options.Create(new AppSettings
        {
            Whisper = new WhisperOptions { ApiKey = "bad-key" }
        });
        var service = new WhisperSttService(client, appSettings, NullLogger<WhisperSttService>.Instance);

        var ex = await Assert.ThrowsAsync<HttpRequestException>(() =>
            service.TranscribeAsync(new byte[] { 1, 2, 3 }, "audio.webm", null));

        Assert.Contains("Incorrect API key", ex.Message);
    }
}
