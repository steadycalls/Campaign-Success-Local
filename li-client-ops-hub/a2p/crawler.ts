import { A2P_PAGE_CONFIGS, type PageTypeConfig } from './urlVariants';

const USER_AGENT = 'Mozilla/5.0 (compatible; LogicInboundA2PChecker/1.0)';
const FETCH_TIMEOUT_MS = 15000;
const DELAY_BETWEEN_REQUESTS_MS = 500;

export interface CrawlResult {
  pageType: string;
  url: string | null;
  status: number | null;
  html: string | null;
  discoveryMethod: string;
  error?: string;
}

/**
 * Crawl a single domain and discover all four A2P required pages.
 */
export async function crawlDomainForA2P(domain: string): Promise<CrawlResult[]> {
  const results: CrawlResult[] = [];
  let baseUrl = `https://${domain}`;

  // Step 1: Fetch homepage to extract navigation links
  let homepageHtml: string | null = null;
  try {
    homepageHtml = await fetchPage(baseUrl);
  } catch (err: unknown) {
    // Try http:// fallback
    try {
      baseUrl = `http://${domain}`;
      homepageHtml = await fetchPage(baseUrl);
    } catch {
      // Domain is unreachable
      const msg = err instanceof Error ? err.message : String(err);
      for (const config of A2P_PAGE_CONFIGS) {
        results.push({
          pageType: config.type,
          url: null,
          status: null,
          html: null,
          discoveryMethod: 'unreachable',
          error: `Domain unreachable: ${msg}`,
        });
      }
      return results;
    }
  }

  // Extract all links from homepage for link-based discovery
  const homepageLinks = extractLinks(homepageHtml, baseUrl);

  // Step 2: For each page type, try to discover the URL
  for (const config of A2P_PAGE_CONFIGS) {
    const result = await discoverPage(baseUrl, config, homepageLinks);
    results.push(result);
    await delay(DELAY_BETWEEN_REQUESTS_MS);
  }

  return results;
}

/**
 * Try to find a specific page type on a domain.
 * Strategy:
 * 1. Check URL variants directly (GET each path, check for 200)
 * 2. Scan homepage links for matching anchor text
 */
async function discoverPage(
  baseUrl: string,
  config: PageTypeConfig,
  homepageLinks: ParsedLink[],
): Promise<CrawlResult> {
  // Strategy 1: Try URL variants
  for (const variant of config.variants) {
    const url = `${baseUrl}${variant}`;
    try {
      const res = await fetchWithStatus(url);
      if (res.status === 200 && res.html && res.html.length > 500) {
        if (!isSoft404(res.html)) {
          return {
            pageType: config.type,
            url,
            status: res.status,
            html: res.html,
            discoveryMethod: 'variant_match',
          };
        }
      }
    } catch {
      continue;
    }
    await delay(200);
  }

  // Strategy 2: Scan homepage links for matching anchor text
  for (const link of homepageLinks) {
    const linkTextLower = link.text.toLowerCase().trim();
    if (config.linkTextPatterns.some(p => linkTextLower.includes(p))) {
      try {
        const res = await fetchWithStatus(link.href);
        if (res.status === 200 && res.html) {
          return {
            pageType: config.type,
            url: link.href,
            status: res.status,
            html: res.html,
            discoveryMethod: 'link_scan',
          };
        }
      } catch {
        continue;
      }
    }
  }

  // Not found
  return {
    pageType: config.type,
    url: null,
    status: null,
    html: null,
    discoveryMethod: 'not_found',
  };
}

async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithStatus(url: string): Promise<{ status: number; html: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: controller.signal,
    });
    const html = res.ok ? await res.text() : null;
    return { status: res.status, html };
  } finally {
    clearTimeout(timeout);
  }
}

interface ParsedLink {
  href: string;
  text: string;
}

function extractLinks(html: string, baseUrl: string): ParsedLink[] {
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const links: ParsedLink[] = [];
  const seen = new Set<string>();
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    let href = match[1].trim();
    const text = match[2].replace(/<[^>]*>/g, '').trim();

    // Resolve relative URLs
    if (href.startsWith('/')) {
      href = `${baseUrl}${href}`;
    } else if (!href.startsWith('http')) {
      href = `${baseUrl}/${href}`;
    }

    // Skip anchors, mailto, tel, javascript
    if (href.startsWith('#') || href.startsWith('mailto:') ||
        href.startsWith('tel:') || href.startsWith('javascript:')) continue;

    if (seen.has(href)) continue;
    seen.add(href);
    links.push({ href, text });
  }

  return links;
}

function isSoft404(html: string): boolean {
  const lower = html.toLowerCase();
  const indicators = [
    'page not found', '404', "page doesn't exist",
    'page does not exist', 'nothing here', 'no longer available',
  ];
  const title = html.match(/<title>(.*?)<\/title>/i)?.[1]?.toLowerCase() || '';
  return indicators.some(i => title.includes(i) || lower.includes(`<h1>${i}</h1>`));
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
