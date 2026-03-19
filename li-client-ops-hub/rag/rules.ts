// ── Content rules for RAG chunking ────────────────────────────────────

export interface ContentChunk {
  content: string;
  chunkIndex: number;
  metadata: Record<string, unknown>;
}

export interface ContentRule {
  sourceType: string;
  sourceTable: string;
  eligibilityFilter: (row: Record<string, unknown>) => boolean;
  contentExtractor: (row: Record<string, unknown>) => ContentChunk[];
}

const MIN_WORDS = 5;

function wordCount(text: string | null | undefined): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function safeJson(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== 'string') return null;
  try { return JSON.parse(json); } catch { return null; }
}

function chunkByWords(text: string, maxWords: number, overlap: number = 50): string[] {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += maxWords - overlap) {
    chunks.push(words.slice(i, i + maxWords).join(' '));
    if (i + maxWords >= words.length) break;
  }
  return chunks;
}

// ── Rules ─────────────────────────────────────────────────────────────

export const CONTENT_RULES: ContentRule[] = [
  // GHL Messages
  {
    sourceType: 'ghl_message',
    sourceTable: 'messages',
    eligibilityFilter: (row) => {
      const body = row.body_preview as string;
      return !!body && wordCount(body) >= MIN_WORDS;
    },
    contentExtractor: (row) => {
      const text = (row.body_preview as string) ?? '';
      if (wordCount(text) <= 500) {
        return [{ content: text, chunkIndex: 0, metadata: { direction: row.direction, type: row.type, contactId: row.contact_id, timestamp: row.message_at } }];
      }
      return chunkByWords(text, 500).map((c, i) => ({
        content: c, chunkIndex: i, metadata: { direction: row.direction, type: row.type, contactId: row.contact_id, timestamp: row.message_at },
      }));
    },
  },

  // Read.ai Transcripts
  {
    sourceType: 'readai_transcript',
    sourceTable: 'meetings',
    eligibilityFilter: (row) => row.expanded === 1 && !!row.transcript_text && wordCount(row.transcript_text as string) >= MIN_WORDS,
    contentExtractor: (row) => {
      const chunks: ContentChunk[] = [];
      const meta = { meetingTitle: row.title, meetingDate: row.meeting_date };

      // Chapter summaries
      const chapters = safeJson(row.chapter_summaries_json as string);
      if (Array.isArray(chapters)) {
        for (let i = 0; i < chapters.length; i++) {
          const text = (chapters[i] as Record<string, unknown>).summary as string ?? '';
          if (wordCount(text) >= MIN_WORDS) {
            chunks.push({ content: text, chunkIndex: i, metadata: { ...meta, chapterTitle: (chapters[i] as Record<string, unknown>).title, chunkType: 'chapter_summary' } });
          }
        }
      }

      // Full transcript in ~500-word segments
      const transcript = (row.transcript_text as string) ?? '';
      const segments = chunkByWords(transcript, 500);
      const offset = chunks.length;
      for (let i = 0; i < segments.length; i++) {
        chunks.push({ content: segments[i], chunkIndex: offset + i, metadata: { ...meta, chunkType: 'transcript_segment', segmentOf: segments.length } });
      }
      return chunks;
    },
  },

  // Read.ai Summaries
  {
    sourceType: 'readai_summary',
    sourceTable: 'meetings',
    eligibilityFilter: (row) => row.expanded === 1 && !!row.summary && wordCount(row.summary as string) >= MIN_WORDS,
    contentExtractor: (row) => [{
      content: row.summary as string,
      chunkIndex: 0,
      metadata: { meetingTitle: row.title, meetingDate: row.meeting_date, contentType: 'meeting_summary' },
    }],
  },

  // Read.ai Action Items
  {
    sourceType: 'readai_action_item',
    sourceTable: 'action_items',
    eligibilityFilter: (row) => !!row.text && wordCount(row.text as string) >= MIN_WORDS,
    contentExtractor: (row) => [{
      content: `Action item: ${row.text}. Assigned to: ${row.assignee ?? 'unassigned'}. Status: ${row.status ?? 'open'}.`,
      chunkIndex: 0,
      metadata: { meetingId: row.meeting_id, assignee: row.assignee, status: row.status },
    }],
  },

  // Read.ai Key Questions
  {
    sourceType: 'readai_key_question',
    sourceTable: 'meetings',
    eligibilityFilter: (row) => {
      const qs = safeJson(row.key_questions_json as string);
      return row.expanded === 1 && Array.isArray(qs) && qs.length > 0;
    },
    contentExtractor: (row) => {
      const qs = (safeJson(row.key_questions_json as string) as unknown as unknown[]) ?? [];
      return qs
        .map((q, i) => {
          const text = typeof q === 'string' ? q : (q as Record<string, unknown>).text as string ?? '';
          return { content: text, chunkIndex: i, metadata: { meetingTitle: row.title, meetingDate: row.meeting_date, contentType: 'key_question' } };
        })
        .filter((c) => wordCount(c.content) >= MIN_WORDS);
    },
  },
];

export { wordCount };
