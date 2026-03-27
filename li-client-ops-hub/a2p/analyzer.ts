import Anthropic from '@anthropic-ai/sdk';
import { A2P_REQUIREMENTS } from './requirements';
import { getEnvValue } from './envHelper';

const MAX_HTML_CHARS = 30000;

export interface RequirementResult {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'unclear';
  evidence: string;
  suggestion?: string;
}

export interface AnalysisResult {
  pageType: string;
  overallStatus: 'pass' | 'partial' | 'fail';
  score: number;
  requirements: RequirementResult[];
  summary: string;
  suggestions: string[];
}

export async function analyzePage(
  html: string,
  pageType: string,
  businessName: string,
  domain: string,
): Promise<AnalysisResult> {
  const apiKey = getEnvValue('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const requirements = A2P_REQUIREMENTS[pageType];
  if (!requirements) throw new Error(`Unknown page type: ${pageType}`);

  const textContent = stripHtml(html).slice(0, MAX_HTML_CHARS);

  const client = new Anthropic({ apiKey });

  const requirementsList = requirements.map(r =>
    `- ${r.id}: ${r.label} — ${r.description} (${r.required ? 'REQUIRED' : 'recommended'})`
  ).join('\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `You are an A2P/10DLC compliance auditor. Analyze this ${pageType.replace(/_/g, ' ')} page from "${businessName}" (${domain}) against the requirements below.

For each requirement, determine if it PASSES, FAILS, or is UNCLEAR from the page content.

REQUIREMENTS TO CHECK:
${requirementsList}

PAGE CONTENT:
---
${textContent}
---

Respond ONLY with valid JSON (no markdown, no backticks, no preamble):
{
  "overallStatus": "pass" | "partial" | "fail",
  "score": <0-100>,
  "requirements": [
    {
      "id": "<requirement_id>",
      "status": "pass" | "fail" | "unclear",
      "evidence": "<brief quote or description of what you found>",
      "suggestion": "<how to fix, only if status is fail or unclear>"
    }
  ],
  "summary": "<1-2 sentence overall assessment>",
  "suggestions": ["<top priority fixes>"]
}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const cleaned = text.replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    return { pageType, ...parsed };
  } catch {
    console.error('[A2P] Failed to parse Claude response:', text.slice(0, 500));
    throw new Error('Failed to parse analysis response');
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
