using System.Text.Json;
using LiveConversation.Web.Models;

namespace LiveConversation.Tests.Unit;

public class CoachFeedbackSerializationTests
{
    [Fact]
    public void CoachFeedback_DeserializationWithoutOriginalText_Succeeds()
    {
        // When LLM generates JSON, it produces fields matching the schema without originalText
        var json = """
        {
            "hasIssues": true,
            "correctedText": "I would like to have a cup of coffee.",
            "nativeAlternative": "Could I get a coffee, please?",
            "explanation": "口语点单时，使用 'Could I get...' 会显得更加自然得体。",
            "vocabularyHighlight": "Could I get..."
        }
        """;

        var feedback = JsonSerializer.Deserialize<CoachFeedback>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        Assert.NotNull(feedback);
        Assert.True(feedback.HasIssues);
        Assert.Equal("I would like to have a cup of coffee.", feedback.CorrectedText);
        Assert.Equal("Could I get a coffee, please?", feedback.NativeAlternative);
        Assert.Equal("口语点单时，使用 'Could I get...' 会显得更加自然得体。", feedback.Explanation);
        Assert.Equal("Could I get...", feedback.VocabularyHighlight);
        Assert.Equal(string.Empty, feedback.OriginalText);

        // Later in service, originalText is assigned
        feedback.OriginalText = "I want coffee.";
        Assert.Equal("I want coffee.", feedback.OriginalText);
    }

    [Fact]
    public void CoachFeedback_DeserializationWithOriginalText_Succeeds()
    {
        var json = """
        {
            "originalText": "He go to school yesterday.",
            "hasIssues": true,
            "correctedText": "He went to school yesterday.",
            "nativeAlternative": "He went to school yesterday.",
            "explanation": "过去时态应使用动词 went。",
            "vocabularyHighlight": "went to school"
        }
        """;

        var feedback = JsonSerializer.Deserialize<CoachFeedback>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        Assert.NotNull(feedback);
        Assert.True(feedback.HasIssues);
        Assert.Equal("He go to school yesterday.", feedback.OriginalText);
        Assert.Equal("He went to school yesterday.", feedback.CorrectedText);
    }

    [Fact]
    public void CoachFeedback_ChineseBilingualFeedback_Succeeds()
    {
        var json = """
        {
            "hasIssues": true,
            "correctedText": "你好啊，你是中国人吗？在干嘛呢等等",
            "nativeAlternative": "哈喽！你也是中国人呀？最近在忙什么呢？",
            "explanation": "针对口语发音识别与倒装语序进行纠偏，使语义表达更规范流畅。",
            "vocabularyHighlight": "在忙什么呢 / 你也是中国人呀"
        }
        """;

        var feedback = JsonSerializer.Deserialize<CoachFeedback>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        Assert.NotNull(feedback);
        Assert.True(feedback.HasIssues);
        Assert.Equal("你好啊，你是中国人吗？在干嘛呢等等", feedback.CorrectedText);
        Assert.Equal("哈喽！你也是中国人呀？最近在忙什么呢？", feedback.NativeAlternative);

        feedback.OriginalText = "你好啊 你真国人 麻干 等等等";
        feedback.Language = "zh";
        Assert.Equal("zh", feedback.Language);
        Assert.Equal("你好啊 你真国人 麻干 等等等", feedback.OriginalText);
    }
}
