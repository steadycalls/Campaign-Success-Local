import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { queryOne, queryAll, execute } from '../db/client';
import { getSerpResults, analyzeCompetitorPageFull, getOnPageAnalysis, type FullPageAnalysis } from './dataforseo-client';
import { delay } from '../sync/utils/rateLimit';
import { logger } from '../lib/logger';

export interface CompetitorAnalysis {
  content_summary: string;
  topics_covered: string[];
  content_gaps: string[];
  strengths: string[];
  weaknesses: string[];
  word_count_assessment: string;
  heading_structure_quality: string;
  recommended_outline: Array<{ heading: string; description: string }>;
  estimated_word_count_needed: number;
  difficulty: string;
}

/**
 * Full competitor analysis pipeline for a gap keyword.
 * 1. Pull SERP results
 * 2. Analyze top 3 competitor pages via DataForSEO
 * 3. Analyze our page if we have one
 * 4. Send to Claude for qualitative comparison
 * 5. Store in competitor_pages + update gap_keywords
 */
export async function analyzeCompetitorsForKeyword(
  gapKeywordId: string
): Promise<{ analyzed: number }> {
  const gap = queryOne('SELECT * FROM gap_keywords WHERE id = ?', [gapKeywordId]);
  if (!gap) throw new Error('Gap keyword not found');

  const company = queryOne('SELECT id, website FROM companies WHERE id = ?', [gap.company_id as string]);
  const companyDomain = (company?.website as string) ?? '';
  const keyword = gap.keyword as string;
  const companyId = gap.company_id as string;

  logger.sync(`Analyzing competitors for "${keyword}"`);

  // 1. Get SERP results
  const serpResults = await getSerpResults(keyword);
  const competitorUrls = serpResults
    .filter(r => !companyDomain || !r.domain.includes(companyDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')))
    .slice(0, 3);

  if (competitorUrls.length === 0) {
    logger.warn('SEO', 'No competitor URLs found in SERP', { keyword });
    return { analyzed: 0 };
  }

  // 2. Analyze each competitor page via DataForSEO
  const competitorPages: (FullPageAnalysis & { serpPosition: number; serpDomain: string })[] = [];
  for (const comp of competitorUrls) {
    try {
      const analysis = await analyzeCompetitorPageFull(comp.url);
      competitorPages.push({ ...analysis, serpPosition: comp.position, serpDomain: comp.domain });
      await delay(300);
    } catch (err: unknown) {
      logger.warn('SEO', `Failed to analyze ${comp.url}`, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // 3. Analyze our page if we have one
  let ourPage: FullPageAnalysis | null = null;
  if (gap.ranking_url) {
    try {
      const onPage = await getOnPageAnalysis(gap.ranking_url as string);
      ourPage = { ...onPage, topics: [], contentType: 'unknown', contentRating: null, datePublished: null };
    } catch { /* our page may not be analyzable */ }
  }

  // 4. Send to Claude for qualitative analysis
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const now = new Date().toISOString();

  for (const comp of competitorPages) {
    const analysis = await analyzeWithClaude(apiKey, keyword, ourPage, comp);

    // 5. Store in competitor_pages
    const existing = queryOne(
      'SELECT id FROM competitor_pages WHERE gap_keyword_id = ? AND url = ?',
      [gapKeywordId, comp.url]
    );

    if (existing) {
      execute(
        `UPDATE competitor_pages SET
          serp_position=?, title=?, meta_description=?, h1=?, headings_json=?,
          word_count=?, topics_covered=?, content_summary=?, content_gaps=?,
          schema_types=?, internal_links=?, external_links=?, on_page_score=?, scraped_at=?
        WHERE id=?`,
        [comp.serpPosition, comp.title, comp.metaDescription, comp.h1,
         JSON.stringify(comp.headings), comp.wordCount,
         JSON.stringify(analysis.topics_covered), analysis.content_summary,
         JSON.stringify(analysis.content_gaps), JSON.stringify(comp.schemaTypes),
         comp.internalLinks, comp.externalLinks, comp.onPageScore, now,
         existing.id as string]
      );
    } else {
      execute(
        `INSERT INTO competitor_pages
          (id, company_id, gap_keyword_id, url, domain, serp_position,
           title, meta_description, h1, headings_json, word_count,
           topics_covered, content_summary, content_gaps, schema_types,
           internal_links, external_links, on_page_score, scraped_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [randomUUID(), companyId, gapKeywordId, comp.url, comp.serpDomain,
         comp.serpPosition, comp.title, comp.metaDescription, comp.h1,
         JSON.stringify(comp.headings), comp.wordCount,
         JSON.stringify(analysis.topics_covered), analysis.content_summary,
         JSON.stringify(analysis.content_gaps), JSON.stringify(comp.schemaTypes),
         comp.internalLinks, comp.externalLinks, comp.onPageScore, now]
      );
    }

    await delay(200);
  }

  // 6. Update gap keyword with top competitor info
  if (competitorPages.length > 0) {
    const top = competitorPages[0];
    execute(
      `UPDATE gap_keywords SET top_competitor_url=?, top_competitor_domain=?, competitor_analysis_json=? WHERE id=?`,
      [top.url, top.serpDomain,
       JSON.stringify(competitorPages.map(c => ({
         url: c.url, domain: c.serpDomain, position: c.serpPosition,
         word_count: c.wordCount, title: c.title,
       }))),
       gapKeywordId]
    );
  }

  logger.sync(`Competitor analysis complete for "${keyword}": ${competitorPages.length} pages analyzed`);
  return { analyzed: competitorPages.length };
}

async function analyzeWithClaude(
  apiKey: string,
  keyword: string,
  ourPage: FullPageAnalysis | null,
  competitorPage: FullPageAnalysis & { serpPosition: number }
): Promise<CompetitorAnalysis> {
  const client = new Anthropic({ apiKey });

  const compContext = `COMPETITOR PAGE (position #${competitorPage.serpPosition}):
URL: ${competitorPage.url}
Title: ${competitorPage.title}
Meta Description: ${competitorPage.metaDescription ?? '(none)'}
H1: ${competitorPage.h1 ?? '(none)'}
Word count: ${competitorPage.wordCount}
On-page score: ${competitorPage.onPageScore ?? 'N/A'}/100
Schema types: ${competitorPage.schemaTypes.join(', ') || 'none'}
Internal links: ${competitorPage.internalLinks}
External links: ${competitorPage.externalLinks}
Topics detected: ${competitorPage.topics.join(', ') || 'none analyzed'}
Heading structure:
${competitorPage.headings.map(h => `  ${h.tag.toUpperCase()}: ${h.text}`).join('\n')}
${competitorPage.plainText ? `\nContent excerpt (first 6000 chars):\n${competitorPage.plainText.slice(0, 6000)}` : ''}`;

  const ourContext = ourPage
    ? `\nOUR PAGE (current ranking):
URL: ${ourPage.url}
Title: ${ourPage.title}
Word count: ${ourPage.wordCount}
On-page score: ${ourPage.onPageScore ?? 'N/A'}/100
Headings: ${ourPage.headings.map(h => `${h.tag}: ${h.text}`).join(', ')}
${ourPage.plainText ? `Content excerpt (first 4000 chars):\n${ourPage.plainText.slice(0, 4000)}` : ''}`
    : '\nWE DO NOT HAVE A PAGE FOR THIS KEYWORD YET.';

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: `You are an SEO content strategist. Compare a competitor's page against our page for a keyword. Return ONLY valid JSON.

JSON schema:
{
  "content_summary": "2-3 sentence summary of what the competitor page covers",
  "topics_covered": ["specific topics/subtopics the competitor covers"],
  "content_gaps": ["topics the competitor covers that our page does NOT"],
  "strengths": ["what the competitor does well"],
  "weaknesses": ["what the competitor does poorly or misses"],
  "word_count_assessment": "too thin | adequate | comprehensive",
  "heading_structure_quality": "poor | adequate | strong",
  "recommended_outline": [{"heading": "H2 heading", "description": "what to cover"}],
  "estimated_word_count_needed": number,
  "difficulty": "easy | moderate | hard"
}`,
    messages: [{
      role: 'user',
      content: `Keyword: "${keyword}"\n\n${compContext}\n${ourContext}\n\nAnalyze the competitor and tell us what we need to do to outrank them.`,
    }],
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('');

  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    return {
      content_summary: 'Analysis failed to parse',
      topics_covered: [], content_gaps: [],
      strengths: [], weaknesses: [],
      word_count_assessment: 'unknown',
      heading_structure_quality: 'unknown',
      recommended_outline: [],
      estimated_word_count_needed: 2000,
      difficulty: 'moderate',
    };
  }
}
