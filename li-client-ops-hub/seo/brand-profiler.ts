import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { queryOne, execute } from '../db/client';
import { logger } from '../lib/logger';

export const BRAND_INTERVIEW_QUESTIONS = [
  {
    id: 'company',
    question: "What's your company name and what do you do in one sentence?",
    placeholder: "e.g., Corpay — we provide global payment solutions for businesses managing cross-border transactions.",
  },
  {
    id: 'audience',
    question: "Who is your ideal customer? Describe them — their role, company size, what keeps them up at night.",
    placeholder: "e.g., CFOs and treasury managers at mid-market companies ($50M-$1B revenue) who are tired of losing money on FX spreads.",
  },
  {
    id: 'differentiator',
    question: "What makes you different from your top 3 competitors? Why would someone pick you?",
    placeholder: "e.g., Unlike Brex which targets startups, we focus on mid-market companies that need both AP automation AND cross-border payments.",
  },
  {
    id: 'tone',
    question: "If your brand were a person at a dinner party, how would they talk? Pick 3-5 adjectives.",
    placeholder: "e.g., Authoritative but not stuffy. Expert but approachable. Data-driven. Practical. No jargon for jargon's sake.",
  },
  {
    id: 'avoid',
    question: "What words, phrases, or tones should we NEVER use in your content?",
    placeholder: "e.g., Never say 'cheap' or 'discount'. Don't use startup-bro language. No clickbait.",
  },
  {
    id: 'examples',
    question: "Share 2-3 sentences from your existing content that sound MOST like how you want to come across.",
    placeholder: "e.g., From our homepage: 'Keep Business Moving. We simplify complex payment workflows so your finance team can focus on strategy.'",
  },
  {
    id: 'geography',
    question: "Is your audience local, national, or international? Any specific regions to focus on?",
    placeholder: "e.g., International — we serve companies in 200+ countries. Content should feel global, not US-centric.",
  },
  {
    id: 'services',
    question: "List your core services or products. Which ones do you most want to drive leads for?",
    placeholder: "e.g., AP Automation, Cross-Border Payments, Commercial Cards, Currency Risk Management. Priority: AP Automation.",
  },
];

export interface BrandProfileData {
  company_name: string;
  industry: string;
  target_audience: string;
  value_proposition: string;
  tone_keywords: string[];
  avoid_keywords: string[];
  writing_style: string;
  example_phrases: string[];
  competitors_to_beat: string[];
  product_services: string;
  geographic_focus: string;
}

export async function processBrandInterview(
  companyId: string,
  answers: Record<string, string>
): Promise<BrandProfileData> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const client = new Anthropic({ apiKey });

  const answersText = BRAND_INTERVIEW_QUESTIONS.map(q =>
    `Q: ${q.question}\nA: ${answers[q.id] || '(not answered)'}`
  ).join('\n\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `Process these brand interview answers into a structured brand voice profile:\n\n${answersText}`,
    }],
    system: `You are a brand strategist creating a writing voice profile.
Process the interview answers into a structured brand profile. Return ONLY valid JSON.

JSON schema:
{
  "company_name": "string",
  "industry": "string",
  "target_audience": "detailed description of ideal customer",
  "value_proposition": "one clear sentence",
  "tone_keywords": ["3-5 adjectives describing the voice"],
  "avoid_keywords": ["words/phrases to never use"],
  "writing_style": "A paragraph a writer could follow to match this brand's voice. Be specific about sentence length, formality, use of data, storytelling approach.",
  "example_phrases": ["5-8 example phrases that sound like this brand"],
  "competitors_to_beat": ["competitor names mentioned"],
  "product_services": "services listed with priority noted",
  "geographic_focus": "local | national | international with details"
}`,
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('');

  let profile: BrandProfileData;
  try {
    profile = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    throw new Error('Failed to parse brand profile from Claude response');
  }

  // Upsert into brand_profiles
  const existing = queryOne('SELECT id FROM brand_profiles WHERE company_id = ?', [companyId]);
  const id = (existing?.id as string) ?? randomUUID();

  if (existing) {
    execute(
      `UPDATE brand_profiles SET
        company_name=?, industry=?, target_audience=?, value_proposition=?,
        tone_keywords=?, avoid_keywords=?, writing_style=?, example_phrases=?,
        competitors_to_beat=?, product_services=?, geographic_focus=?,
        interview_raw=?, status='complete', updated_at=datetime('now')
      WHERE id=?`,
      [profile.company_name, profile.industry, profile.target_audience, profile.value_proposition,
       JSON.stringify(profile.tone_keywords), JSON.stringify(profile.avoid_keywords),
       profile.writing_style, JSON.stringify(profile.example_phrases),
       JSON.stringify(profile.competitors_to_beat), profile.product_services, profile.geographic_focus,
       JSON.stringify(answers), id]
    );
  } else {
    execute(
      `INSERT INTO brand_profiles
        (id, company_id, company_name, industry, target_audience, value_proposition,
         tone_keywords, avoid_keywords, writing_style, example_phrases,
         competitors_to_beat, product_services, geographic_focus, interview_raw, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'complete')`,
      [id, companyId, profile.company_name, profile.industry, profile.target_audience,
       profile.value_proposition, JSON.stringify(profile.tone_keywords),
       JSON.stringify(profile.avoid_keywords), profile.writing_style,
       JSON.stringify(profile.example_phrases), JSON.stringify(profile.competitors_to_beat),
       profile.product_services, profile.geographic_focus, JSON.stringify(answers)]
    );
  }

  logger.sync(`Brand profile saved for company ${companyId}`);
  return profile;
}

export function getBrandProfile(companyId: string): Record<string, unknown> | null {
  return queryOne('SELECT * FROM brand_profiles WHERE company_id = ?', [companyId]);
}
