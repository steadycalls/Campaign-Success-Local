import { delay } from '../sync/utils/rateLimit';
import { logger } from '../lib/logger';

const DATAFORSEO_BASE = 'https://api.dataforseo.com';

function getCredentials(): { login: string; password: string } {
  const login = process.env['DATAFORSEO_LOGIN'] || '';
  const password = process.env['DATAFORSEO_PASSWORD'] || '';
  if (!login || !password) throw new Error('DataForSEO credentials not configured');
  return { login, password };
}

async function dataForSeoFetch<T>(endpoint: string, body?: unknown): Promise<T> {
  const { login, password } = getCredentials();
  const auth = Buffer.from(`${login}:${password}`).toString('base64');

  const res = await fetch(`${DATAFORSEO_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 429) {
    logger.warn('DATAFORSEO', 'Rate limited, retrying in 10s', { endpoint });
    await delay(10000);
    return dataForSeoFetch(endpoint, body);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '[unreadable]');
    throw new Error(`DataForSEO ${res.status} at ${endpoint}: ${text.slice(0, 500)}`);
  }

  const json = await res.json() as { status_code: number; status_message?: string; tasks: T };
  if (json.status_code !== 20000) {
    throw new Error(`DataForSEO error: ${json.status_message || 'Unknown error'}`);
  }

  return json.tasks as T;
}

// ── SERP Results ─────────────────────────────────────────────────────

export interface SerpResult {
  position: number;
  url: string;
  domain: string;
  title: string;
  description: string;
}

export async function getSerpResults(
  keyword: string,
  location?: string,
  maxResults: number = 10
): Promise<SerpResult[]> {
  const tasks = await dataForSeoFetch<Array<{ result: Array<{ items: Array<Record<string, unknown>> }> }>>(
    '/v3/serp/google/organic/live/advanced',
    [{
      keyword,
      location_name: location || 'United States',
      language_name: 'English',
      depth: maxResults,
    }]
  );

  const items = tasks?.[0]?.result?.[0]?.items ?? [];
  return items
    .filter((item: Record<string, unknown>) => item.type === 'organic')
    .map((item: Record<string, unknown>) => ({
      position: (item.rank_absolute as number) ?? 0,
      url: (item.url as string) ?? '',
      domain: (item.domain as string) ?? '',
      title: (item.title as string) ?? '',
      description: (item.description as string) ?? '',
    }));
}

// ── On-Page Instant Analysis ─────────────────────────────────────────

export interface OnPageResult {
  url: string;
  statusCode: number;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  headings: Array<{ tag: string; text: string }>;
  wordCount: number;
  plainText: string | null;
  schemaTypes: string[];
  internalLinks: number;
  externalLinks: number;
  onPageScore: number | null;
  pageSize: number | null;
  responseTime: number | null;
}

export async function getOnPageAnalysis(url: string): Promise<OnPageResult> {
  const tasks = await dataForSeoFetch<Array<{ result: Array<{ items: Array<Record<string, unknown>> }> }>>(
    '/v3/on_page/instant_pages',
    [{
      url,
      enable_javascript: true,
      enable_browser_rendering: true,
      load_resources: true,
    }]
  );

  const items = tasks?.[0]?.result?.[0]?.items ?? [];
  const page = items.find((item: Record<string, unknown>) => item.resource_type === 'html') || items[0];
  if (!page) throw new Error(`No HTML page data returned for ${url}`);

  const meta = (page.meta as Record<string, unknown>) ?? {};
  const htags = (meta.htags as Record<string, string[]>) ?? {};
  const content = (meta.content as Record<string, unknown>) ?? {};
  const timing = (page.page_timing as Record<string, unknown>) ?? {};

  return {
    url: (page.url as string) ?? url,
    statusCode: (page.status_code as number) ?? 0,
    title: (meta.title as string) ?? null,
    metaDescription: (meta.description as string) ?? null,
    h1: (htags.h1 as string[])?.[0] ?? null,
    headings: buildHeadingsArray(htags),
    wordCount: (content.plain_text_word_count as number) ?? 0,
    plainText: (content.plain_text as string) ?? null,
    schemaTypes: extractSchemaTypes(page),
    internalLinks: (page.internal_links_count as number) ?? 0,
    externalLinks: (page.external_links_count as number) ?? 0,
    onPageScore: (page.onpage_score as number) ?? null,
    pageSize: (page.size as number) ?? null,
    responseTime: (timing.download_time as number) ?? (timing.dom_complete as number) ?? null,
  };
}

// ── Content Analysis ─────────────────────────────────────────────────

export interface ContentAnalysisResult {
  topics: string[];
  contentType: string;
  rating: number | null;
  wordCount: number | null;
  datePublished: string | null;
}

export async function getContentAnalysis(url: string): Promise<ContentAnalysisResult> {
  try {
    const tasks = await dataForSeoFetch<Array<{ result: Array<{ items?: Array<Record<string, unknown>> }> }>>(
      '/v3/content_analysis/search/live',
      [{
        page_type: ['article', 'blog', 'landing_page'],
        search_mode: 'as_is',
        url,
      }]
    );

    const item = tasks?.[0]?.result?.[0]?.items?.[0];
    if (!item) return { topics: [], contentType: 'unknown', rating: null, wordCount: null, datePublished: null };

    const contentInfo = (item.content_info as Record<string, unknown>) ?? {};
    return {
      topics: (item.categories as string[]) ?? [],
      contentType: ((item.page_types as string[]) ?? [])[0] ?? 'unknown',
      rating: (contentInfo.content_quality_score as number) ?? null,
      wordCount: (contentInfo.words_count as number) ?? null,
      datePublished: (contentInfo.date_published as string) ?? null,
    };
  } catch {
    return { topics: [], contentType: 'unknown', rating: null, wordCount: null, datePublished: null };
  }
}

// ── Keyword Volumes (batch) ──────────────────────────────────────────

export interface KeywordVolume {
  keyword: string;
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
}

export async function getKeywordVolumes(keywords: string[]): Promise<KeywordVolume[]> {
  if (keywords.length === 0) return [];

  // DataForSEO accepts up to 700 keywords per request
  const batches: string[][] = [];
  for (let i = 0; i < keywords.length; i += 700) {
    batches.push(keywords.slice(i, i + 700));
  }

  const results: KeywordVolume[] = [];
  for (const batch of batches) {
    try {
      const tasks = await dataForSeoFetch<Array<{ result: Array<{ items?: Array<Record<string, unknown>> }> }>>(
        '/v3/keywords_data/google_ads/search_volume/live',
        [{ keywords: batch, location_name: 'United States', language_name: 'English' }]
      );

      for (const item of tasks?.[0]?.result ?? []) {
        for (const kw of (item.items as Array<Record<string, unknown>>) ?? []) {
          results.push({
            keyword: (kw.keyword as string) ?? '',
            searchVolume: (kw.search_volume as number) ?? null,
            cpc: (kw.cpc as number) ?? null,
            competition: (kw.competition as number) ?? null,
          });
        }
      }
    } catch (err: unknown) {
      logger.warn('DATAFORSEO', 'Keyword volume fetch failed', { error: err instanceof Error ? err.message : String(err) });
    }
    if (batches.length > 1) await delay(500);
  }

  return results;
}

// ── Full Competitor Page Analysis (On-Page + Content Analysis) ───────

export interface FullPageAnalysis extends OnPageResult {
  topics: string[];
  contentType: string;
  contentRating: number | null;
  datePublished: string | null;
  serpPosition?: number;
  serpDomain?: string;
}

export async function analyzeCompetitorPageFull(url: string): Promise<FullPageAnalysis> {
  const [onPage, content] = await Promise.all([
    getOnPageAnalysis(url),
    getContentAnalysis(url).catch(() => ({
      topics: [], contentType: 'unknown', rating: null, wordCount: null, datePublished: null,
    })),
  ]);

  return {
    ...onPage,
    topics: content.topics,
    contentType: content.contentType,
    contentRating: content.rating,
    datePublished: content.datePublished,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function buildHeadingsArray(htags: Record<string, string[]>): Array<{ tag: string; text: string }> {
  const result: Array<{ tag: string; text: string }> = [];
  for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
    for (const text of (htags[tag] ?? [])) {
      result.push({ tag, text });
    }
  }
  return result;
}

function extractSchemaTypes(page: Record<string, unknown>): string[] {
  const checks = (page.checks as Record<string, unknown>) ?? {};
  const types: string[] = [];
  if (checks.has_microdata) types.push('microdata');
  if (checks.has_json_ld) types.push('json-ld');
  if (checks.has_rdfa) types.push('rdfa');
  return types;
}
