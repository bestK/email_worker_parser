/** Extract original alias address from DuckDuckGo forwarded email HTML. */
export function extractDuckDuckGoAlias(html) {
    const m = html.match(
        /https:\/\/duckduckgo\.com\/email\/addresses\/([A-Za-z0-9_=+\/\-]+)/
    );
    if (!m) return null;
    try {
        const raw = m[1];
        const padded = raw + '=='.slice(0, (4 - (raw.length % 4)) % 4);
        const decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
        const addr = JSON.parse(decoded)?.address;
        if (typeof addr !== 'string' || !addr) return null;
        const lower = addr.toLowerCase();
        return lower.includes('@') ? lower : `${lower}@duck.com`;
    } catch {
        return null;
    }
}

/** Resolve forwarded-to address from headers, falling back to HTML body parsing. */
export function resolveForwardedTo(headers, html) {
    const fromHeader = headers.find(
        (h) => h.key.toLowerCase() === 'x-forwarded-to'
    )?.value;
    if (fromHeader) return fromHeader;
    if (html) return extractDuckDuckGoAlias(html);
    return null;
}
