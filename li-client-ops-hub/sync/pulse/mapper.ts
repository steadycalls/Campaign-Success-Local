/**
 * Pulse Pipeline Mapper (v4 — BANT-informed, behavior-driven)
 *
 * 8 stages replacing temperature model (Hot/Warm/Cold/Opted Out/Sold):
 *   1. Lists       — Unworked contacts (no conversation, no BANT)
 *   2. New         — Fresh qualified leads (≥1/4 BANT, just engaged)
 *   3. Cold        — Had contact but stalled, quarterly nurture
 *   4. Paused      — Specific stall reason, scheduled follow-up
 *   5. Warm        — Active conversation, BANT qualified, meetings scheduled
 *   6. Closed / Won — Deal complete
 *   7. Opted Out   — Dead leads with data value
 *   8. Spam / Garbage — Zero value
 */

export type PulseStage =
  | 'Lists'
  | 'New'
  | 'Cold'
  | 'Paused'
  | 'Warm'
  | 'Closed / Won'
  | 'Opted Out'
  | 'Spam / Garbage';

// ── Layer 1: Status overrides (absolute) ─────────────────────────────

const WON_STAGE_PATTERNS = [
  'closed won', 'sold', 'client roi achieved', 'client goal achieved', 'approved',
];

const LOST_STAGE_PATTERNS = [
  'closed lost', 'disqualified', 'failed bant', 'client cancelled',
  'opted out', 'not approved',
];

const SPAM_STAGE_PATTERNS = [
  'bad lead', 'spam', 'junk', 'garbage', 'test', 'duplicate', 'fake',
];

// ── Layer 2: Stage-to-baseline mapping ───────────────────────────────

const PAUSED_PATTERNS = [
  'paused', 'on hold', 'hold', 'callback', 'reschedule',
  'waiting on', 'pending decision',
];

const COLD_PATTERNS = [
  'new lead', 'initial inquiry', 'interested in intro call', 'not started',
  'quarterly mailing list', 'open',
  'contact attempted', 'attempting contact', 'contacted lead', 'pending contact',
  'contacted in the last', 'not contacted', 'need ein', 'need website',
  'long term follow up', 'follow up in', 'future follow-up',
  'currently unqualified', 'no show', 'needs rescheduling',
];

const WARM_PATTERNS = [
  'connected', 'engaged', 'needs scheduling', 'intro call scheduled',
  'intro call completed', "qa'd lead", 'reconnected',
  'intro call scheduled (set)', 'intro call completed (shown)',
  'a2p submitted', 'needs review', 'resubmitted',
  'begin work', 'onboarding', 'quoted', 'claimed', 'documents collected',
  'appointment set', 'showed', 'analysis call', 'analysis call scheduled',
  'analysis call completed', 'negotiation', 'negotiations', 'negotiations/follow up',
  'in-negotiation', 'closing', 'meeting scheduled', 'meeting shown',
  'first seo lead',
];

function matchesAny(stageName: string, patterns: string[]): boolean {
  const lower = stageName.toLowerCase().trim();
  return patterns.some((p) => lower.includes(p));
}

function getStageBaseline(stageName: string): PulseStage {
  if (matchesAny(stageName, WARM_PATTERNS)) return 'Warm';
  if (matchesAny(stageName, PAUSED_PATTERNS)) return 'Paused';
  if (matchesAny(stageName, COLD_PATTERNS)) return 'Cold';
  return 'Cold'; // unrecognized stages default to Cold
}

// ── Stage rank for demotion logic ────────────────────────────────────

const STAGE_RANK: Record<PulseStage, number> = {
  'Lists': 0,
  'New': 1,
  'Cold': 2,
  'Paused': 3,
  'Warm': 4,
  'Closed / Won': 10,
  'Opted Out': -1,
  'Spam / Garbage': -2,
};

function applyRecencyDemotion(
  baseline: PulseStage,
  daysSinceActivity: number,
  thresholds: { hotMax: number; warmMax: number; coldMax: number }
): PulseStage {
  // Terminal stages and Paused are never demoted
  if (
    baseline === 'Closed / Won' ||
    baseline === 'Opted Out' ||
    baseline === 'Spam / Garbage' ||
    baseline === 'Paused' ||
    baseline === 'Lists'
  ) {
    return baseline;
  }

  if (daysSinceActivity > thresholds.coldMax) return 'Cold';
  if (daysSinceActivity > thresholds.warmMax) {
    return STAGE_RANK[baseline] >= STAGE_RANK['Warm'] ? 'Cold' : baseline;
  }

  return baseline;
}

// ── Main mapping function ────────────────────────────────────────────

export interface PulseMappingInput {
  status: string;
  stageName: string;
  updatedAt: string;
  lastContactedAt?: string | null;
  hasConversationHistory: boolean;
  bantScore: number | null;
}

export interface PulseMappingThresholds {
  hotMax: number;
  warmMax: number;
  coldMax: number;
}

export interface PulseMappingResult {
  stage: PulseStage;
  reason: string;
}

export function mapToPulseStage(
  input: PulseMappingInput,
  thresholds: PulseMappingThresholds
): PulseMappingResult {
  const { status, stageName, updatedAt, lastContactedAt, hasConversationHistory, bantScore } = input;

  // ── Layer 1: Status overrides ──

  if (matchesAny(stageName, SPAM_STAGE_PATTERNS)) {
    return { stage: 'Spam / Garbage', reason: `stage="${stageName}" matched spam pattern` };
  }

  if (status === 'won' || matchesAny(stageName, WON_STAGE_PATTERNS)) {
    return { stage: 'Closed / Won', reason: `status=${status}, stage="${stageName}"` };
  }

  if (status === 'lost' || status === 'abandoned' || matchesAny(stageName, LOST_STAGE_PATTERNS)) {
    return { stage: 'Opted Out', reason: `status=${status}, stage="${stageName}"` };
  }

  // ── Lists check: no conversation history and no BANT ──
  if (!hasConversationHistory && (bantScore == null || bantScore === 0)) {
    return { stage: 'Lists', reason: `No conversation history, BANT=${bantScore ?? 'none'} — unworked lead` };
  }

  // ── Layer 2: Hybrid — stage baseline + recency demotion ──
  const baseline = getStageBaseline(stageName);

  const activityDate = lastContactedAt ?? updatedAt;
  const daysSince = activityDate
    ? Math.floor((Date.now() - new Date(activityDate).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  const finalStage = applyRecencyDemotion(baseline, daysSince, thresholds);

  // BANT promotion: qualified but stalled contacts → New
  if (bantScore != null && bantScore >= 1 && finalStage === 'Cold' && hasConversationHistory) {
    if (daysSince <= thresholds.warmMax) {
      return {
        stage: 'New',
        reason: `stage="${stageName}" → baseline=${baseline}, BANT=${bantScore}/4 with recent activity (${daysSince}d) → New`,
      };
    }
  }

  const demoted = finalStage !== baseline;
  const reason = demoted
    ? `stage="${stageName}" → baseline=${baseline}, demoted to ${finalStage} (${daysSince}d since activity)`
    : `stage="${stageName}" → ${finalStage} (${daysSince}d since activity)`;

  return { stage: finalStage, reason };
}
