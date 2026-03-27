/**
 * Extract clean domain from a URL or website field.
 * Strips protocol, www, and path — returns just the domain.
 *
 * "https://www.heartscreen.health/about" → "heartscreen.health"
 * "http://procarerestorations.com/services" → "procarerestorations.com"
 * "alpharesto.net" → "alpharesto.net"
 * "" | null | undefined → ""
 */
export function extractDomain(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const withProtocol = url.startsWith('http') ? url : `https://${url}`;
    const host = new URL(withProtocol).hostname;
    return host.replace(/^www\./, '');
  } catch {
    // Fallback: strip protocol and path manually
    return url
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .split('?')[0]
      .trim();
  }
}
