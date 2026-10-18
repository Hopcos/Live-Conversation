using LiveConversation.Web.Common;

namespace LiveConversation.Tests.Unit;

public class SentenceSegmenterTests
{
    [Fact]
    public void TryExtractNextSentence_SingleCompleteSentence_ReturnsCorrectSentence()
    {
        var segmenter = new SentenceSegmenter();
        segmenter.Append("Hello there! ");

        var sentence = segmenter.TryExtractNextSentence();

        Assert.Equal("Hello there!", sentence);
        Assert.Null(segmenter.TryExtractNextSentence());
    }

    [Fact]
    public void TryExtractNextSentence_MultipleSentencesStreamed_ReturnsSequentially()
    {
        var segmenter = new SentenceSegmenter();
        
        segmenter.Append("Hi Rachel. ");
        var s1 = segmenter.TryExtractNextSentence();
        Assert.Equal("Hi Rachel.", s1);

        segmenter.Append("How are you feeling today? ");
        var s2 = segmenter.TryExtractNextSentence();
        Assert.Equal("How are you feeling today?", s2);

        segmenter.Append("I am excited to practice English with you! ");
        var s3 = segmenter.TryExtractNextSentence();
        Assert.Equal("I am excited to practice English with you!", s3);
    }

    [Fact]
    public void TryExtractNextSentence_Abbreviation_DoesNotPrematurelySplit()
    {
        var segmenter = new SentenceSegmenter();
        segmenter.Append("Dr. Watson and Mr. Holmes arrived in the U.S. yesterday. ");

        var sentence = segmenter.TryExtractNextSentence();

        Assert.Equal("Dr. Watson and Mr. Holmes arrived in the U.S. yesterday.", sentence);
    }

    [Fact]
    public void TryExtractNextSentence_Ellipsis_DoesNotSplitPrematurely()
    {
        var segmenter = new SentenceSegmenter();
        segmenter.Append("Well... that is truly fascinating! ");

        var sentence = segmenter.TryExtractNextSentence();

        Assert.Equal("Well... that is truly fascinating!", sentence);
    }

    [Fact]
    public void TryExtractNextSentence_NumbersWithDecimals_DoesNotSplit()
    {
        var segmenter = new SentenceSegmenter();
        segmenter.Append("The project costs 3.14 million dollars. ");

        var sentence = segmenter.TryExtractNextSentence();

        Assert.Equal("The project costs 3.14 million dollars.", sentence);
    }

    [Fact]
    public void Flush_IncompleteSentenceAtEnd_ReturnsRemainingContent()
    {
        var segmenter = new SentenceSegmenter();
        segmenter.Append("This is a final thought without punctuation");

        var premature = segmenter.TryExtractNextSentence();
        Assert.Null(premature);

        var flushed = segmenter.Flush();
        Assert.Equal("This is a final thought without punctuation", flushed);
        Assert.Null(segmenter.Flush()); // Second flush is empty
    }
}
