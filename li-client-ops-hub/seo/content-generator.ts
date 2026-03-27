import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { queryOne, queryAll, execute } from '../db/client';
import { logger } from '../lib/logger';

export interface GenerateOptions {
  wordCountTarget?: number;
  format?: 'blog_post' | 'landing_page' | 'pillar_page';
}

/**
 * Generate a full SEO article for a gap keyword.
 * Uses: gap data + competitor analysis + brand voice + existing pages.
 */
export async function generateContentForKeyword(
  gapKeywordId: string,
  companyId: string,
  options?: GenerateOptions
): Promise<string> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const gap = queryOne('SELECT * FROM gap_keywords WHERE id = ?', [gapKeywordId]);
  if (!gap) throw new Error('Gap keyword not found');

  const brand = queryOne('SELECT * FROM brand_profiles WHERE company_id = ?', [companyId]);
  const competitors = queryAll(
    'SELECT * FROM competitor_pages WHERE gap_keyword_id = ? ORDER BY serp_position ASC LIMIT 3',
    [gapKeywordId]
  );

  // Get existing site pages for internal link suggestions
  const existingPages = queryAll(
    "SELECT url, title FROM ghl_sites WHERE company_id = ? LIMIT 30",
    [companyId]
  );

  const systemPrompt = buildSystemPrompt(brand);
  const userPrompt = buildUserPrompt(gap, competitors, existingPages, options);

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('');

  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

  let article: Record<string, unknown>;
  try {
    article = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    // If JSON parse fails, treat the whole response as markdown content
    article = {
      title: `Article: ${gap.keyword}`,
      slug: (gap.keyword as string).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      meta_title: gap.keyword,
      meta_description: '',
      secondary_keywords: [],
      headings: [],
      content_markdown: text,
      content_html: `<article>${text}</article>`,
      word_count: text.split(/\s+/).length,
      internal_links: [],
      schema: {},
    };
  }

  // Store in generated_content
  const contentId = randomUUID();
  execute(
    `INSERT INTO generated_content
      (id, company_id, gap_keyword_id, title, slug, target_keyword,
       secondary_keywords, content_html, content_markdown, word_count,
       meta_title, meta_description, headings_json, internal_link_suggestions,
       schema_suggestion, brand_profile_id, competitor_urls_analyzed,
       generation_prompt, model_used, tokens_used, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [contentId, companyId, gapKeywordId,
     article.title ?? gap.keyword,
     article.slug ?? '',
     gap.keyword,
     JSON.stringify(article.secondary_keywords ?? []),
     (article.content_html as string) ?? '',
     (article.content_markdown as string) ?? '',
     (article.word_count as number) ?? 0,
     (article.meta_title as string) ?? '',
     (article.meta_description as string) ?? '',
     JSON.stringify(article.headings ?? []),
     JSON.stringify(article.internal_links ?? []),
     JSON.stringify(article.schema ?? {}),
     (brand?.id as string) ?? null,
     JSON.stringify(competitors.map(c => c.url)),
     userPrompt.slice(0, 5000),
     'claude-sonnet-4-20250514',
     tokensUsed,
     'draft']
  );

  // Link content back to gap keyword
  execute(
    "UPDATE gap_keywords SET content_id = ?, action_status = 'in_progress' WHERE id = ?",
    [contentId, gapKeywordId]
  );

  logger.sync(`Content generated for "${gap.keyword}": ${article.word_count ?? 0} words, ${tokensUsed} tokens`);
  return contentId;
}

function buildSystemPrompt(brand: Record<string, unknown> | null): string {
  const voiceSection = brand ? `
BRAND VOICE PROFILE:
Company: ${brand.company_name}
Industry: ${brand.industry}
Target audience: ${brand.target_audience}
Value proposition: ${brand.value_proposition}
Tone: ${safeParseArray(brand.tone_keywords as string).join(', ')}
AVOID these words/phrases: ${safeParseArray(brand.avoid_keywords as string).join(', ')}
Writing style: ${brand.writing_style}
Example phrases: ${safeParseArray(brand.example_phrases as string).join(' | ')}
` : 'No brand voice profile configured. Write in a professional, authoritative tone.';

  return `You are an SEO content strategist writing an article to outrank current top results for a keyword.

${voiceSection}

WRITING RULES:
- Write for humans first, search engines second.
- Use the target keyword naturally — never stuff it.
- Include secondary keywords where they fit organically.
- Every H2 section should be substantive (150+ words).
- Include specific data, examples, or actionable steps — not filler.
- End with a clear CTA that fits the brand.
- Suggest internal links to existing pages on the site.

OUTPUT FORMAT — return ONLY valid JSON:
{
  "title": "page title (60 chars max)",
  "slug": "url-slug-here",
  "meta_title": "SEO title tag (60 chars)",
  "meta_description": "meta description (155 chars)",
  "secondary_keywords": ["kw1", "kw2", "kw3"],
  "headings": [{"level": "h2", "text": "..."}, ...],
  "content_markdown": "full article in markdown...",
  "content_html": "full article in HTML...",
  "word_count": number,
  "internal_links": [{"anchor": "text", "target_url": "/page", "reason": "why"}],
  "schema": {"@type": "Article", ...}
}`;
}

function buildUserPrompt(
  gap: Record<string, unknown>,
  competitors: Array<Record<string, unknown>>,
  existingPages: Array<Record<string, unknown>>,
  options?: GenerateOptions
): string {
  const format = options?.format ?? 'blog_post';
  const wordTarget = options?.wordCountTarget ?? 1800;

  let prompt = `Write a ${format.replace(/_/g, ' ')} targeting the keyword "${gap.keyword}".

TARGET: Position ${Math.round(gap.current_position as number)} → Page 1 (top 3)
Search volume: ${gap.search_volume ?? 'unknown'}/month
${gap.ranking_url ? `Our current ranking page: ${gap.ranking_url}` : 'We have NO existing page for this keyword.'}

COMPETITOR ANALYSIS:`;

  for (const comp of competitors) {
    prompt += `\n\n#${comp.serp_position}: ${comp.url}
Title: ${comp.title}
Word count: ${comp.word_count}
Topics covered: ${comp.topics_covered ?? '[]'}
Content gaps: ${comp.content_gaps ?? '[]'}
Summary: ${comp.content_summary ?? 'No summary available'}`;
  }

  prompt += `\n\nYour article must:
1. Cover everything the top competitors cover
2. Fill the gaps they miss (these are our differentiators)
3. Be at least ${wordTarget} words
4. Include a unique angle the competitors don't have`;

  if (existingPages.length > 0) {
    prompt += `\n\nEXISTING SITE PAGES (for internal linking):
${existingPages.slice(0, 20).map(p => `- ${p.url}: ${p.title ?? '(no title)'}`).join('\n')}`;
  }

  prompt += '\n\nReturn the full article as JSON matching the schema in your instructions.';
  return prompt;
}

function safeParseArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}
