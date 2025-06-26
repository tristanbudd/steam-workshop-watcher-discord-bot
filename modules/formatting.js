/**
 * Converts Steam formatting to Discord Markdown with optional safe truncation.
 *
 * @param {string} text - The Steam formatted text.
 * @param {number} [maxLength] - Optional max length of the final text.
 * @returns {string} The converted text in Discord Markdown format.
 */
function steamToDiscordFormatting(text, maxLength) {
    if (!text) return '';

    // Normalize line endings
    let discordText = text.replace(/\r\n/g, '\n');

    // Headings
    discordText = discordText.replace(/\[h1\](.*?)\[\/h1\]/gi, '# $1\n');
    discordText = discordText.replace(/\[h2\](.*?)\[\/h2\]/gi, '## $1\n');
    discordText = discordText.replace(/\[h3\](.*?)\[\/h3\]/gi, '### $1\n');

    // Bold, Italic, Underline, Strikethrough
    discordText = discordText.replace(/\[b\](.*?)\[\/b\]/gi, '**$1**');
    discordText = discordText.replace(/\[u\](.*?)\[\/u\]/gi, '__$1__');
    discordText = discordText.replace(/\[i\](.*?)\[\/i\]/gi, '*$1*');
    discordText = discordText.replace(/\[strike\](.*?)\[\/strike\]/gi, '~~$1~~');

    // Spoiler
    discordText = discordText.replace(/\[spoiler\](.*?)\[\/spoiler\]/gi, '||$1||');

    // URLs
    discordText = discordText.replace(/\[url=(.*?)\](.*?)\[\/url\]/gi, (match, url, label) => {
        url = url.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
        return `[${label.trim()}](${url})`;
    });

    // Horizontal Rule
    discordText = discordText.replace(/\[hr\]\s*\[\/hr\]/gi, '\n---\n');

    // Quotes
    discordText = discordText.replace(/\[quote=(.*?)\](.*?)\[\/quote\]/gsi, '> **Originally posted by $1:**\n> $2');

    // Code blocks
    discordText = discordText.replace(/\[code\]([\s\S]*?)\[\/code\]/gsi, '```\n$1\n```');

    // Unordered lists
    discordText = discordText.replace(/\[list\]([\s\S]*?)\[\/list\]/gi, (match, content) => {
        return content.replace(/\[\*\]\s*/g, '- ').trim();
    });

    // Ordered lists
    discordText = discordText.replace(/\[olist\]([\s\S]*?)\[\/olist\]/gi, (match, content) => {
        let counter = 1;
        return content.replace(/\[\*\]\s*/g, () => `${counter++}. `).trim();
    });

    // Remove unsupported tags
    discordText = discordText.replace(/\[noparse\][\s\S]*?\[\/noparse\]/gi, '');
    discordText = discordText.replace(/\[table.*?\][\s\S]*?\[\/table\]/gi, '');

    // Clean empty links
    discordText = discordText.replace(/^\s*\[\]\(\)\s*$/gm, '');

    discordText = discordText.trim();

    // Safe truncation
    if (maxLength && discordText.length > maxLength) {
        discordText = safeTruncate(discordText, maxLength);
    }

    return discordText;
}

/**
 * Safely truncates Markdown without breaking links, code blocks, spoilers, or bold/italic structures.
 *
 * @param {string} text
 * @param {number} maxLength
 * @returns {string} Safely truncated string.
 */
function safeTruncate(text, maxLength) {
    if (text.length <= maxLength) return text;

    let truncated = text.slice(0, maxLength);

    // Step 1: Ensure no partial Markdown links
    const linkRegex = /\[([^\]]*)\]\(([^\)]*)\)/g;
    let match;
    let lastValidIndex = 0;

    while ((match = linkRegex.exec(truncated)) !== null) {
        // Save the end index of the last complete link
        lastValidIndex = linkRegex.lastIndex;
    }

    // If we truncated in the middle of a link, fallback to last complete link
    if (lastValidIndex === 0 && truncated.includes('[') && truncated.includes('](')) {
        // If we have an incomplete link and no complete one before, remove the partial link
        truncated = truncated.replace(/\[[^\]]*$/g, '');
    } else if (lastValidIndex > 0) {
        truncated = truncated.slice(0, lastValidIndex);
    }

    // Step 2: Close unclosed Markdown elements
    const codeBlockCount = (truncated.match(/```/g) || []).length;
    if (codeBlockCount % 2 !== 0) truncated += '```';

    const spoilerCount = (truncated.match(/\|\|/g) || []).length;
    if (spoilerCount % 2 !== 0) truncated += '||';

    const closeUnmatched = (symbol) => {
        const count = (truncated.match(new RegExp(`\\${symbol}`, 'g')) || []).length;
        if (count % 2 !== 0) truncated += symbol;
    };
    closeUnmatched('*');
    closeUnmatched('_');
    closeUnmatched('~');

    return `${truncated.trim()}\n... and (${text.length - truncated.length} more characters)`;
}

/**
 * Truncates a string to a specified maximum length, appending "..." if truncated.
 * This function is useful for ensuring that text fits within a certain character limit,
 *
 * @param text
 * @param maxLength
 * @returns {*|string}
 */
function truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
}

module.exports = {
    steamToDiscordFormatting,
    truncate
};
