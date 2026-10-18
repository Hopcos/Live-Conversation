using System.Text;
using System.Text.RegularExpressions;

namespace LiveConversation.Web.Common;

public partial class SentenceSegmenter
{
    private readonly StringBuilder _buffer = new();
    
    // Common abbreviations that shouldn't trigger sentence split
    private static readonly HashSet<string> KnownAbbreviations = new(StringComparer.OrdinalIgnoreCase)
    {
        "mr.", "mrs.", "ms.", "dr.", "prof.", "jr.", "sr.", "vs.",
        "e.g.", "i.e.", "etc.", "u.s.", "u.k.", "approx.", "dept.",
        "inc.", "ltd.", "co.", "corp.", "st.", "ave.", "rd.", "blvd."
    };

    [GeneratedRegex(@"[^\w\s]")]
    private static partial Regex PunctuationRegex();

    public void Append(string token)
    {
        _buffer.Append(token);
    }

    /// <summary>
    /// Attempts to extract the next complete sentence from the current buffer.
    /// Returns null if no complete sentence boundary is met yet.
    /// </summary>
    public string? TryExtractNextSentence()
    {
        var text = _buffer.ToString();
        if (string.IsNullOrWhiteSpace(text)) return null;

        int splitIndex = -1;
        int searchLength = text.Length;

        for (int i = 0; i < searchLength - 1; i++)
        {
            char c = text[i];
            char next = text[i + 1];

            // 1. Look for terminal punctuation followed by whitespace or quote
            if (c is '.' or '?' or '!')
            {
                // Check if followed by quote e.g., '." ' or '!" '
                int boundaryOffset = 1;
                if (next is '"' or '\'' or '”')
                {
                    boundaryOffset = 2;
                    if (i + 2 < searchLength && char.IsWhiteSpace(text[i + 2]))
                    {
                        // Match with quote
                    }
                    else if (i + 2 >= searchLength)
                    {
                        continue; // Wait for more tokens
                    }
                }
                else if (!char.IsWhiteSpace(next) && next != '\n' && next != '\r')
                {
                    // If not followed by whitespace, check if it's decimal point like 3.14 or part of word
                    continue;
                }

                // Check for ellipsis ...
                if (c == '.' && i + 1 < searchLength && text[i + 1] == '.')
                {
                    continue;
                }
                if (c == '.' && i > 0 && text[i - 1] == '.')
                {
                    continue;
                }

                // Check if abbreviation
                int wordStart = i - 1;
                while (wordStart >= 0 && !char.IsWhiteSpace(text[wordStart]))
                {
                    wordStart--;
                }
                wordStart++;
                var candidateWord = text[wordStart..(i + 1)].Trim();
                if (KnownAbbreviations.Contains(candidateWord))
                {
                    continue; // Skip abbreviation
                }

                splitIndex = i + boundaryOffset;
                break;
            }

            // 2. Clause break for long sentences: if buffer > 75 chars and hits a comma/semicolon followed by space
            if (i > 75 && c is ',' or ';' or ':' && char.IsWhiteSpace(next))
            {
                splitIndex = i + 1;
                break;
            }
        }

        if (splitIndex > 0)
        {
            var sentence = text[..splitIndex].Trim();
            _buffer.Remove(0, splitIndex);

            // Clean leading whitespace left in buffer
            while (_buffer.Length > 0 && char.IsWhiteSpace(_buffer[0]))
            {
                _buffer.Remove(0, 1);
            }

            return string.IsNullOrWhiteSpace(sentence) ? null : sentence;
        }

        return null;
    }

    /// <summary>
    /// Flushes any remaining text when streaming completes.
    /// </summary>
    public string? Flush()
    {
        var remaining = _buffer.ToString().Trim();
        _buffer.Clear();
        return string.IsNullOrWhiteSpace(remaining) ? null : remaining;
    }

    public void Clear()
    {
        _buffer.Clear();
    }
}
