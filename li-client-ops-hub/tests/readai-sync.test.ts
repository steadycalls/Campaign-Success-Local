import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock modules before imports ──────────────────────────────────────

// Mock db/client
const mockQueryAll = vi.fn<(sql: string, params?: unknown[]) => Array<Record<string, unknown>>>();
const mockQueryOne = vi.fn<(sql: string, params?: unknown[]) => Record<string, unknown> | null>();
const mockExecute = vi.fn<(sql: string, params?: unknown[]) => number>();

vi.mock('../db/client', () => ({
  queryAll: (...args: unknown[]) => mockQueryAll(args[0] as string, args[1] as unknown[]),
  queryOne: (...args: unknown[]) => mockQueryOne(args[0] as string, args[1] as unknown[]),
  execute: (...args: unknown[]) => mockExecute(args[0] as string, args[1] as unknown[]),
}));

// Mock logger
vi.mock('../lib/logger', () => ({
  logger: {
    sync: vi.fn(),
    auth: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    d1: vi.fn(),
  },
}));

// Mock sync logger
vi.mock('../sync/utils/logger', () => ({
  logAlert: vi.fn(),
}));

// Mock rate limit
vi.mock('../sync/utils/rateLimit', () => ({
  delay: vi.fn().mockResolvedValue(undefined),
}));

// Mock readai-auth: getValidReadAiToken
const mockGetValidReadAiToken = vi.fn<() => Promise<string>>();
vi.mock('../electron/ipc/readai-auth', () => ({
  getValidReadAiToken: () => mockGetValidReadAiToken(),
}));

// Mock global fetch
const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', mockFetch);

// ── Now import the module under test ─────────────────────────────────

import {
  syncMeetingsList,
  expandMeetingDetails,
  syncReadAiMeetingsRange,
  getReadAiSyncState,
  saveReadAiSyncState,
  getSinceDate,
  scheduleOvernightSync,
  getOvernightSyncPending,
  clearOvernightSync,
} from '../sync/adapters/readai';

// ── Test Data Fixtures ───────────────────────────────────────────────

function makeMeetingApiResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'readai-meeting-001',
    title: 'Weekly Standup with Acme Corp',
    start_time_ms: 1700000000000,
    end_time_ms: 1700003600000,
    platform: 'zoom',
    platform_id: 'zoom-123',
    owner: { name: 'John Smith', email: 'john@logicinbound.com' },
    participants: [
      { name: 'John Smith', email: 'john@logicinbound.com', invited: true, attended: true },
      { name: 'Jane Doe', email: 'jane@acmecorp.com', invited: true, attended: true },
      { name: 'Bob Wilson', email: 'bob@acmecorp.com', invited: true, attended: false },
    ],
    report_url: 'https://app.read.ai/reports/001',
    folders: [{ id: 'f1', name: 'Client Meetings' }],
    ...overrides,
  };
}

function makeMeetingDetailResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'readai-meeting-001',
    summary: 'Discussed Q4 campaign strategy and next steps.',
    topics: ['Campaign Strategy', 'Budget Review', 'Timeline'],
    key_questions: ['What is the budget for Q4?', 'When does the campaign launch?'],
    chapter_summaries: [
      { title: 'Intro', text: 'Team introductions and agenda review.' },
      { title: 'Strategy', text: 'Discussed the overall Q4 approach.' },
    ],
    action_items: [
      { text: 'Send Q4 proposal', assignee: { name: 'John Smith' }, completed: false, due_date: '2024-01-15' },
      { text: 'Review budget spreadsheet', assignee: { name: 'Jane Doe' }, completed: true },
    ],
    metrics: { read_score: 85, sentiment: 0.7, engagement: 0.9 },
    transcript: {
      text: 'John: Welcome everyone...\nJane: Thanks for having us...',
      segments: [
        { speaker: 'John Smith', text: 'Welcome everyone...' },
        { speaker: 'Jane Doe', text: 'Thanks for having us...' },
      ],
    },
    recording_download: 'https://app.read.ai/recordings/001.mp4',
    live_enabled: false,
    ...overrides,
  };
}

function makeApiListResponse(meetings: unknown[], hasMore = false) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve({ data: meetings, has_more: hasMore }),
    text: () => Promise.resolve(''),
  } as unknown as Response;
}

function makeApiDetailResponse(detail: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve(detail),
    text: () => Promise.resolve(''),
  } as unknown as Response;
}

function makeErrorResponse(status: number, body = 'error') {
  return {
    ok: false,
    status,
    headers: new Headers(),
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeRateLimitResponse(retryAfter = '1') {
  const headers = new Headers();
  headers.set('retry-after', retryAfter);
  return {
    ok: false,
    status: 429,
    headers,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve('rate limited'),
  } as unknown as Response;
}

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockGetValidReadAiToken.mockResolvedValue('test-access-token');
});

// ────────────────────────────────────────────────────────────────────
// Domain extraction & company matching (tested indirectly via sync)
// ────────────────────────────────────────────────────────────────────

describe('syncMeetingsList (Pass 1)', () => {
  it('fetches meetings and creates new records when no existing match', async () => {
    // API returns one meeting, no more pages
    mockFetch.mockResolvedValueOnce(makeApiListResponse([makeMeetingApiResponse()]));

    // company_domains lookup => match acmecorp.com
    mockQueryOne.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('company_domains')) {
        if (params?.[0] === 'acmecorp.com') return { company_id: 'company-acme' };
        return null;
      }
      if (sql.includes('SELECT id FROM meetings')) return null; // no existing
      return null;
    });
    mockExecute.mockReturnValue(1);

    const result = await syncMeetingsList(30);

    expect(result.found).toBe(1);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);

    // Verify INSERT was called
    const insertCall = mockExecute.mock.calls.find(c => (c[0] as string).includes('INSERT INTO meetings'));
    expect(insertCall).toBeTruthy();
    const params = insertCall![1] as unknown[];
    // readai_meeting_id
    expect(params[1]).toBe('readai-meeting-001');
    // company_id
    expect(params[2]).toBe('company-acme');
    // title
    expect(params[3]).toBe('Weekly Standup with Acme Corp');
    // participants_count
    expect(params[13]).toBe(3);
    // attended_count
    expect(params[14]).toBe(2);
  });

  it('updates existing meetings instead of creating duplicates', async () => {
    mockFetch.mockResolvedValueOnce(makeApiListResponse([makeMeetingApiResponse()]));

    mockQueryOne.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('company_domains')) {
        if (params?.[0] === 'acmecorp.com') return { company_id: 'company-acme' };
        return null;
      }
      if (sql.includes('SELECT id FROM meetings')) return { id: 'existing-uuid-123' };
      return null;
    });
    mockExecute.mockReturnValue(1);

    const result = await syncMeetingsList(30);

    expect(result.found).toBe(1);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);

    const updateCall = mockExecute.mock.calls.find(c => (c[0] as string).includes('UPDATE meetings SET'));
    expect(updateCall).toBeTruthy();
    const params = updateCall![1] as unknown[];
    // Last param is the existing ID
    expect(params[params.length - 1]).toBe('existing-uuid-123');
  });

  it('filters out generic email domains (gmail, outlook, etc.)', async () => {
    const meeting = makeMeetingApiResponse({
      participants: [
        { name: 'John', email: 'john@logicinbound.com', attended: true },
        { name: 'Someone', email: 'someone@gmail.com', attended: true },
        { name: 'Other', email: 'other@yahoo.com', attended: true },
      ],
    });
    mockFetch.mockResolvedValueOnce(makeApiListResponse([meeting]));

    mockQueryOne.mockImplementation((sql: string) => {
      if (sql.includes('company_domains')) return null; // no match
      if (sql.includes('SELECT id FROM meetings')) return null;
      return null;
    });
    mockExecute.mockReturnValue(1);

    const result = await syncMeetingsList(30);

    expect(result.found).toBe(1);
    expect(result.created).toBe(1);

    // Verify matched_domains is empty (all generic domains filtered)
    const insertCall = mockExecute.mock.calls.find(c => (c[0] as string).includes('INSERT INTO meetings'));
    const params = insertCall![1] as unknown[];
    // matched_domains param (index 17 in INSERT)
    expect(params[17]).toBe('[]');
    // match_method
    expect(params[18]).toBe('unmatched');
  });

  it('paginates through multiple pages', async () => {
    const meeting1 = makeMeetingApiResponse({ id: 'meeting-page1' });
    const meeting2 = makeMeetingApiResponse({ id: 'meeting-page2' });

    // Page 1: has_more = true
    mockFetch.mockResolvedValueOnce(makeApiListResponse([meeting1], true));
    // Page 2: has_more = false
    mockFetch.mockResolvedValueOnce(makeApiListResponse([meeting2], false));

    mockQueryOne.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('company_domains')) {
        if (params?.[0] === 'acmecorp.com') return { company_id: 'company-acme' };
        return null;
      }
      if (sql.includes('SELECT id FROM meetings')) return null;
      return null;
    });
    mockExecute.mockReturnValue(1);

    const result = await syncMeetingsList(30);

    expect(result.found).toBe(2);
    expect(result.created).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Second call should include cursor
    const secondUrl = mockFetch.mock.calls[1][0] as string;
    expect(secondUrl).toContain('cursor=meeting-page1');
  });

  it('stops paginating when API returns empty data', async () => {
    mockFetch.mockResolvedValueOnce(makeApiListResponse([], false));

    const result = await syncMeetingsList(30);

    expect(result.found).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('calculates duration correctly from start/end timestamps', async () => {
    const startMs = 1700000000000;
    const endMs = startMs + 45 * 60 * 1000; // 45 minutes
    const meeting = makeMeetingApiResponse({ start_time_ms: startMs, end_time_ms: endMs });

    mockFetch.mockResolvedValueOnce(makeApiListResponse([meeting]));
    mockQueryOne.mockImplementation((sql: string) => {
      if (sql.includes('company_domains')) return null;
      if (sql.includes('SELECT id FROM meetings')) return null;
      return null;
    });
    mockExecute.mockReturnValue(1);

    await syncMeetingsList(30);

    const insertCall = mockExecute.mock.calls.find(c => (c[0] as string).includes('INSERT INTO meetings'));
    const params = insertCall![1] as unknown[];
    // duration_minutes (index 7)
    expect(params[7]).toBe(45);
  });

  it('handles meetings with no end_time_ms gracefully', async () => {
    const meeting = makeMeetingApiResponse({ end_time_ms: undefined });
    mockFetch.mockResolvedValueOnce(makeApiListResponse([meeting]));

    mockQueryOne.mockImplementation((sql: string) => {
      if (sql.includes('company_domains')) return null;
      if (sql.includes('SELECT id FROM meetings')) return null;
      return null;
    });
    mockExecute.mockReturnValue(1);

    await syncMeetingsList(30);

    const insertCall = mockExecute.mock.calls.find(c => (c[0] as string).includes('INSERT INTO meetings'));
    const params = insertCall![1] as unknown[];
    // end_time_ms should be null
    expect(params[6]).toBeNull();
    // duration should be null
    expect(params[7]).toBeNull();
  });

  it('handles meetings with no participants gracefully', async () => {
    const meeting = makeMeetingApiResponse({ participants: undefined });
    mockFetch.mockResolvedValueOnce(makeApiListResponse([meeting]));

    mockQueryOne.mockImplementation((sql: string) => {
      if (sql.includes('company_domains')) return null;
      if (sql.includes('SELECT id FROM meetings')) return null;
      return null;
    });
    mockExecute.mockReturnValue(1);

    await syncMeetingsList(30);

    const insertCall = mockExecute.mock.calls.find(c => (c[0] as string).includes('INSERT INTO meetings'));
    const params = insertCall![1] as unknown[];
    // participants_count should be 0
    expect(params[13]).toBe(0);
    // attended_count should be 0
    expect(params[14]).toBe(0);
  });

  it('handles rate limiting with retry', async () => {
    const meeting = makeMeetingApiResponse();
    // First call: rate limited
    mockFetch.mockResolvedValueOnce(makeRateLimitResponse('1'));
    // Retry: success
    mockFetch.mockResolvedValueOnce(makeApiListResponse([meeting]));

    mockQueryOne.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('company_domains')) {
        if (params?.[0] === 'acmecorp.com') return { company_id: 'company-acme' };
        return null;
      }
      if (sql.includes('SELECT id FROM meetings')) return null;
      return null;
    });
    mockExecute.mockReturnValue(1);

    const result = await syncMeetingsList(30);

    expect(result.found).toBe(1);
    // Two fetch calls: rate limited + retry
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws on non-retryable API errors', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(403, 'Forbidden'));

    await expect(syncMeetingsList(30)).rejects.toThrow('Read.ai 403');
  });

  it('preserves existing company_id using COALESCE on update', async () => {
    mockFetch.mockResolvedValueOnce(makeApiListResponse([makeMeetingApiResponse()]));

    mockQueryOne.mockImplementation((sql: string) => {
      if (sql.includes('company_domains')) return null; // no domain match this time
      if (sql.includes('SELECT id FROM meetings')) return { id: 'existing-id' };
      return null;
    });
    mockExecute.mockReturnValue(1);

    await syncMeetingsList(30);

    const updateCall = mockExecute.mock.calls.find(c => (c[0] as string).includes('UPDATE meetings SET'));
    expect(updateCall).toBeTruthy();
    // SQL should use COALESCE to preserve existing company_id
    expect(updateCall![0]).toContain('COALESCE(company_id, ?)');
  });
});

// ────────────────────────────────────────────────────────────────────
// Pass 2: Expand meeting details
// ────────────────────────────────────────────────────────────────────

describe('expandMeetingDetails (Pass 2)', () => {
  it('fetches detail for unexpanded meetings and updates them', async () => {
    mockQueryAll.mockReturnValueOnce([
      { id: 'local-uuid-1', readai_meeting_id: 'readai-001', company_id: 'company-acme' },
    ]);

    mockFetch.mockResolvedValueOnce(makeApiDetailResponse(makeMeetingDetailResponse()));
    mockQueryOne.mockReturnValue(null); // no existing action items
    mockExecute.mockReturnValue(1);

    const result = await expandMeetingDetails(20);

    expect(result.found).toBe(1);
    expect(result.updated).toBe(1);

    // Verify detail UPDATE was called
    const updateCall = mockExecute.mock.calls.find(c =>
      (c[0] as string).includes('UPDATE meetings SET') && (c[0] as string).includes('summary')
    );
    expect(updateCall).toBeTruthy();
    const params = updateCall![1] as unknown[];
    // summary
    expect(params[0]).toBe('Discussed Q4 campaign strategy and next steps.');
    // read_score
    expect(params[5]).toBe(85);
    // sentiment
    expect(params[6]).toBe(0.7);
    // engagement
    expect(params[7]).toBe(0.9);
    // expanded = 1 is in the SQL, last param is meeting id
    expect(params[params.length - 1]).toBe('local-uuid-1');
  });

  it('creates action items from meeting details', async () => {
    mockQueryAll.mockReturnValueOnce([
      { id: 'local-uuid-1', readai_meeting_id: 'readai-001', company_id: 'company-acme' },
    ]);

    mockFetch.mockResolvedValueOnce(makeApiDetailResponse(makeMeetingDetailResponse()));
    mockQueryOne.mockReturnValue(null); // no existing action items
    mockExecute.mockReturnValue(1);

    await expandMeetingDetails(20);

    // Find INSERT INTO action_items calls
    const actionInserts = mockExecute.mock.calls.filter(c =>
      (c[0] as string).includes('INSERT INTO action_items')
    );
    expect(actionInserts.length).toBe(2);

    // First action item
    const params1 = actionInserts[0][1] as unknown[];
    expect(params1[2]).toBe('company-acme'); // company_id
    expect(params1[3]).toBe('Send Q4 proposal'); // text
    expect(params1[4]).toBe('John Smith'); // assignee
    expect(params1[5]).toBe('open'); // status (not completed)
    expect(params1[6]).toBe('2024-01-15'); // due_date

    // Second action item (completed)
    const params2 = actionInserts[1][1] as unknown[];
    expect(params2[3]).toBe('Review budget spreadsheet');
    expect(params2[5]).toBe('done'); // completed = true
  });

  it('updates existing action items instead of duplicating', async () => {
    mockQueryAll.mockReturnValueOnce([
      { id: 'local-uuid-1', readai_meeting_id: 'readai-001', company_id: 'company-acme' },
    ]);

    mockFetch.mockResolvedValueOnce(makeApiDetailResponse(makeMeetingDetailResponse()));
    // Existing action item found
    mockQueryOne.mockImplementation((sql: string) => {
      if (sql.includes('action_items') && sql.includes('meeting_id')) {
        return { id: 'existing-action-1' };
      }
      return null;
    });
    mockExecute.mockReturnValue(1);

    await expandMeetingDetails(20);

    const actionUpdates = mockExecute.mock.calls.filter(c =>
      (c[0] as string).includes('UPDATE action_items')
    );
    expect(actionUpdates.length).toBe(2);
  });

  it('handles API errors for individual meetings without crashing batch', async () => {
    mockQueryAll.mockReturnValueOnce([
      { id: 'local-uuid-1', readai_meeting_id: 'fail-001', company_id: 'c1' },
      { id: 'local-uuid-2', readai_meeting_id: 'ok-002', company_id: 'c2' },
    ]);

    // First meeting: error
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500, 'Internal error'));
    // Second meeting: success
    mockFetch.mockResolvedValueOnce(makeApiDetailResponse(makeMeetingDetailResponse()));
    mockQueryOne.mockReturnValue(null);
    mockExecute.mockReturnValue(1);

    const result = await expandMeetingDetails(20);

    // Should process both, only one succeeds
    expect(result.found).toBe(2);
    expect(result.updated).toBe(1);
  });

  it('handles meetings with missing optional fields', async () => {
    mockQueryAll.mockReturnValueOnce([
      { id: 'local-uuid-1', readai_meeting_id: 'readai-001', company_id: 'company-acme' },
    ]);

    const sparseDetail = {
      id: 'readai-001',
      summary: 'Brief call.',
      // No topics, key_questions, transcript, metrics, action_items, etc.
    };
    mockFetch.mockResolvedValueOnce(makeApiDetailResponse(sparseDetail));
    mockExecute.mockReturnValue(1);

    const result = await expandMeetingDetails(20);

    expect(result.updated).toBe(1);

    const updateCall = mockExecute.mock.calls.find(c =>
      (c[0] as string).includes('summary') && (c[0] as string).includes('UPDATE meetings')
    );
    const params = updateCall![1] as unknown[];
    expect(params[0]).toBe('Brief call.'); // summary
    expect(params[1]).toBeNull(); // topics_json
    expect(params[2]).toBeNull(); // key_questions_json
    expect(params[5]).toBeNull(); // read_score (metrics?.read_score ?? null)
  });

  it('respects batchSize limit', async () => {
    mockQueryAll.mockReturnValueOnce([
      { id: 'u1', readai_meeting_id: 'r1', company_id: 'c1' },
    ]);

    mockFetch.mockResolvedValueOnce(makeApiDetailResponse(makeMeetingDetailResponse()));
    mockQueryOne.mockReturnValue(null);
    mockExecute.mockReturnValue(1);

    await expandMeetingDetails(1);

    // Verify the LIMIT parameter in the query
    const selectCall = mockQueryAll.mock.calls[0];
    expect(selectCall[1]).toEqual([1]);
  });

  it('stores transcript text from detail response', async () => {
    mockQueryAll.mockReturnValueOnce([
      { id: 'local-uuid-1', readai_meeting_id: 'readai-001', company_id: 'company-acme' },
    ]);

    mockFetch.mockResolvedValueOnce(makeApiDetailResponse(makeMeetingDetailResponse()));
    mockQueryOne.mockReturnValue(null);
    mockExecute.mockReturnValue(1);

    await expandMeetingDetails(20);

    const updateCall = mockExecute.mock.calls.find(c =>
      (c[0] as string).includes('transcript_text')
    );
    const params = updateCall![1] as unknown[];
    // transcript_text
    expect(params[8]).toBe('John: Welcome everyone...\nJane: Thanks for having us...');
    // transcript_json should be stringified
    expect(params[9]).toContain('segments');
  });
});

// ────────────────────────────────────────────────────────────────────
// Date-Ranged Sync
// ────────────────────────────────────────────────────────────────────

describe('syncReadAiMeetingsRange', () => {
  it('syncs meetings within date range and tracks oldest/newest', async () => {
    const m1 = makeMeetingApiResponse({ id: 'r1', start_time_ms: 1700000000000 });
    const m2 = makeMeetingApiResponse({ id: 'r2', start_time_ms: 1700100000000 });
    mockFetch.mockResolvedValueOnce(makeApiListResponse([m1, m2], false));

    mockQueryOne.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('company_domains')) {
        if (params?.[0] === 'acmecorp.com') return { company_id: 'company-acme' };
        return null;
      }
      if (sql.includes('SELECT id FROM meetings')) return null;
      return null;
    });
    mockExecute.mockReturnValue(1);

    const result = await syncReadAiMeetingsRange({ sinceDate: '2023-11-01T00:00:00.000Z' });

    expect(result.fetched).toBe(2);
    expect(result.created).toBe(2);
    expect(result.hasMore).toBe(false);
    expect(result.oldestFetched).toBeTruthy();
    expect(result.newestFetched).toBeTruthy();
    // newest should be later than oldest
    expect(new Date(result.newestFetched!).getTime()).toBeGreaterThan(new Date(result.oldestFetched!).getTime());
  });

  it('inserts unmatched meetings with null company_id', async () => {
    const meeting = makeMeetingApiResponse({
      participants: [
        { name: 'Unknown', email: 'unknown@gmail.com', attended: true },
      ],
    });
    mockFetch.mockResolvedValueOnce(makeApiListResponse([meeting], false));

    mockQueryOne.mockImplementation((sql: string) => {
      if (sql.includes('company_domains')) return null;
      if (sql.includes('SELECT id FROM meetings')) return null;
      return null;
    });
    mockExecute.mockReturnValue(1);

    const result = await syncReadAiMeetingsRange({});

    expect(result.fetched).toBe(1);
    expect(result.created).toBe(1); // inserted with null company_id
    expect(result.updated).toBe(0);

    // Verify company_id param is null
    const insertCall = mockExecute.mock.calls.find(c => (c[0] as string).includes('INSERT INTO meetings'));
    expect(insertCall).toBeTruthy();
    const params = insertCall![1] as unknown[];
    expect(params[2]).toBeNull(); // company_id
  });

  it('still updates existing unmatched meetings', async () => {
    const meeting = makeMeetingApiResponse({
      participants: [
        { name: 'Person', email: 'person@gmail.com', attended: true },
      ],
    });
    mockFetch.mockResolvedValueOnce(makeApiListResponse([meeting], false));

    mockQueryOne.mockImplementation((sql: string) => {
      if (sql.includes('company_domains')) return null;
      if (sql.includes('SELECT id FROM meetings')) return { id: 'existing-uuid' };
      return null;
    });
    mockExecute.mockReturnValue(1);

    const result = await syncReadAiMeetingsRange({});

    expect(result.fetched).toBe(1);
    expect(result.updated).toBe(1); // updates even without match
  });

  it('respects maxPages limit', async () => {
    // Always return has_more = true
    mockFetch.mockImplementation(() =>
      Promise.resolve(makeApiListResponse([makeMeetingApiResponse()], true))
    );

    mockQueryOne.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('company_domains')) {
        if (params?.[0] === 'acmecorp.com') return { company_id: 'c1' };
        return null;
      }
      if (sql.includes('SELECT id FROM meetings')) return null;
      return null;
    });
    mockExecute.mockReturnValue(1);

    const result = await syncReadAiMeetingsRange({ maxPages: 3 });

    // Should stop after 3 pages (+ 1 initial = 4 fetches, but the loop increments after processing)
    expect(result.hasMore).toBe(true);
    expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('resumes from cursor position', async () => {
    mockFetch.mockResolvedValueOnce(makeApiListResponse([makeMeetingApiResponse()], false));

    mockQueryOne.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('company_domains')) {
        if (params?.[0] === 'acmecorp.com') return { company_id: 'c1' };
        return null;
      }
      if (sql.includes('SELECT id FROM meetings')) return null;
      return null;
    });
    mockExecute.mockReturnValue(1);

    await syncReadAiMeetingsRange({ cursor: 'resume-cursor-123' });

    const fetchUrl = mockFetch.mock.calls[0][0] as string;
    expect(fetchUrl).toContain('cursor=resume-cursor-123');
  });
});

// ────────────────────────────────────────────────────────────────────
// Sync State Management
// ────────────────────────────────────────────────────────────────────

describe('Sync State', () => {
  it('returns default state when no saved state', () => {
    mockQueryOne.mockReturnValueOnce(null);

    const state = getReadAiSyncState();

    expect(state.oldestMeetingSynced).toBeNull();
    expect(state.newestMeetingSynced).toBeNull();
    expect(state.totalMeetingsSynced).toBe(0);
    expect(state.lastSyncAt).toBeNull();
    expect(state.historicalSyncComplete).toBe(false);
  });

  it('parses saved state from app_state table', () => {
    mockQueryOne.mockReturnValueOnce({
      value: JSON.stringify({
        oldestMeetingSynced: '2023-01-01',
        newestMeetingSynced: '2024-01-01',
        totalMeetingsSynced: 150,
        lastSyncAt: '2024-01-15T10:00:00Z',
        historicalSyncComplete: true,
      }),
    });

    const state = getReadAiSyncState();

    expect(state.totalMeetingsSynced).toBe(150);
    expect(state.historicalSyncComplete).toBe(true);
    expect(state.oldestMeetingSynced).toBe('2023-01-01');
  });

  it('handles corrupted JSON in app_state gracefully', () => {
    mockQueryOne.mockReturnValueOnce({ value: 'not valid json {{{' });

    const state = getReadAiSyncState();

    expect(state.totalMeetingsSynced).toBe(0);
    expect(state.historicalSyncComplete).toBe(false);
  });

  it('saves state using upsert', () => {
    mockExecute.mockReturnValue(1);

    saveReadAiSyncState({
      oldestMeetingSynced: '2023-06-01',
      newestMeetingSynced: '2024-01-15',
      totalMeetingsSynced: 200,
      lastSyncAt: new Date().toISOString(),
      historicalSyncComplete: false,
      historicalSyncCursor: 'cursor-abc',
      historicalSyncTarget: null,
    });

    expect(mockExecute).toHaveBeenCalledTimes(1);
    const sql = mockExecute.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO app_state');
    expect(sql).toContain('ON CONFLICT');
    const savedJson = mockExecute.mock.calls[0][1]![0] as string;
    const parsed = JSON.parse(savedJson);
    expect(parsed.totalMeetingsSynced).toBe(200);
    expect(parsed.historicalSyncCursor).toBe('cursor-abc');
  });
});

// ────────────────────────────────────────────────────────────────────
// getSinceDate helper
// ────────────────────────────────────────────────────────────────────

describe('getSinceDate', () => {
  it('returns today midnight for "today"', () => {
    const result = getSinceDate('today');
    const parsed = new Date(result);
    expect(parsed.getHours()).toBe(0);
    expect(parsed.getMinutes()).toBe(0);
  });

  it('returns ~7 days ago for "week"', () => {
    const result = getSinceDate('week');
    const diff = Date.now() - new Date(result).getTime();
    const daysDiff = diff / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeCloseTo(7, 0);
  });

  it('returns ~30 days ago for "month"', () => {
    const result = getSinceDate('month');
    const diff = Date.now() - new Date(result).getTime();
    const daysDiff = diff / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeGreaterThanOrEqual(27);
    expect(daysDiff).toBeLessThanOrEqual(32);
  });

  it('returns ~90 days ago for "quarter"', () => {
    const result = getSinceDate('quarter');
    const diff = Date.now() - new Date(result).getTime();
    const daysDiff = diff / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeGreaterThanOrEqual(89);
    expect(daysDiff).toBeLessThanOrEqual(92);
  });

  it('returns ~365 days ago for "year"', () => {
    const result = getSinceDate('year');
    const diff = Date.now() - new Date(result).getTime();
    const daysDiff = diff / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeGreaterThanOrEqual(365);
    expect(daysDiff).toBeLessThanOrEqual(366);
  });
});

// ────────────────────────────────────────────────────────────────────
// Overnight Sync
// ────────────────────────────────────────────────────────────────────

describe('Overnight Sync', () => {
  it('scheduleOvernightSync saves to app_state', () => {
    mockExecute.mockReturnValue(1);

    scheduleOvernightSync('quarter', '2023-10-01T00:00:00.000Z');

    const call = mockExecute.mock.calls[0];
    expect((call[0] as string)).toContain('readai_overnight_sync');
    const saved = JSON.parse(call[1]![0] as string);
    expect(saved.range).toBe('quarter');
    expect(saved.sinceDate).toBe('2023-10-01T00:00:00.000Z');
    expect(saved.scheduledAt).toBeTruthy();
  });

  it('getOvernightSyncPending returns null when nothing scheduled', () => {
    mockQueryOne.mockReturnValueOnce(null);

    expect(getOvernightSyncPending()).toBeNull();
  });

  it('getOvernightSyncPending parses stored data', () => {
    mockQueryOne.mockReturnValueOnce({
      value: JSON.stringify({ range: 'year', sinceDate: '2023-01-01', scheduledAt: '2024-01-01' }),
    });

    const result = getOvernightSyncPending();

    expect(result?.range).toBe('year');
    expect(result?.sinceDate).toBe('2023-01-01');
  });

  it('clearOvernightSync deletes from app_state', () => {
    mockExecute.mockReturnValue(1);

    clearOvernightSync();

    const call = mockExecute.mock.calls[0];
    expect(call[0]).toBe("DELETE FROM app_state WHERE key = 'readai_overnight_sync'");
  });
});

// ────────────────────────────────────────────────────────────────────
// Domain matching edge cases
// ────────────────────────────────────────────────────────────────────

describe('Domain matching (via sync)', () => {
  it('matches the first corporate domain found', async () => {
    const meeting = makeMeetingApiResponse({
      participants: [
        { name: 'A', email: 'a@corp1.com', attended: true },
        { name: 'B', email: 'b@corp2.com', attended: true },
      ],
    });
    mockFetch.mockResolvedValueOnce(makeApiListResponse([meeting], false));

    let domainLookupCount = 0;
    mockQueryOne.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('company_domains')) {
        domainLookupCount++;
        if (params?.[0] === 'corp1.com') return { company_id: 'company-1' };
        if (params?.[0] === 'corp2.com') return { company_id: 'company-2' };
        return null;
      }
      if (sql.includes('SELECT id FROM meetings')) return null;
      return null;
    });
    mockExecute.mockReturnValue(1);

    await syncMeetingsList(30);

    // Should match first domain found
    const insertCall = mockExecute.mock.calls.find(c => (c[0] as string).includes('INSERT INTO meetings'));
    const params = insertCall![1] as unknown[];
    // company_id should be from first match
    expect(params[2]).toBe('company-1');
  });

  it('excludes logicinbound.com as a generic domain', async () => {
    const meeting = makeMeetingApiResponse({
      participants: [
        { name: 'Internal', email: 'staff@logicinbound.com', attended: true },
        { name: 'Client', email: 'client@clientcorp.com', attended: true },
      ],
    });
    mockFetch.mockResolvedValueOnce(makeApiListResponse([meeting], false));

    mockQueryOne.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('company_domains')) {
        // logicinbound.com should never be looked up
        expect(params?.[0]).not.toBe('logicinbound.com');
        if (params?.[0] === 'clientcorp.com') return { company_id: 'company-client' };
        return null;
      }
      if (sql.includes('SELECT id FROM meetings')) return null;
      return null;
    });
    mockExecute.mockReturnValue(1);

    await syncMeetingsList(30);

    const insertCall = mockExecute.mock.calls.find(c => (c[0] as string).includes('INSERT INTO meetings'));
    const params = insertCall![1] as unknown[];
    expect(params[2]).toBe('company-client');
  });

  it('handles participants with no email', async () => {
    const meeting = makeMeetingApiResponse({
      participants: [
        { name: 'No Email Person', attended: true },
        { name: 'Client', email: 'client@clientcorp.com', attended: true },
      ],
    });
    mockFetch.mockResolvedValueOnce(makeApiListResponse([meeting], false));

    mockQueryOne.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('company_domains')) {
        if (params?.[0] === 'clientcorp.com') return { company_id: 'c1' };
        return null;
      }
      if (sql.includes('SELECT id FROM meetings')) return null;
      return null;
    });
    mockExecute.mockReturnValue(1);

    // Should not crash
    const result = await syncMeetingsList(30);
    expect(result.created).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Action item edge cases
// ────────────────────────────────────────────────────────────────────

describe('Action item upsert edge cases', () => {
  it('handles action items with description instead of text', async () => {
    mockQueryAll.mockReturnValueOnce([
      { id: 'local-1', readai_meeting_id: 'r1', company_id: 'c1' },
    ]);

    const detail = makeMeetingDetailResponse({
      action_items: [
        { description: 'Follow up on proposal', assignee: 'Alice', completed: false },
      ],
    });
    mockFetch.mockResolvedValueOnce(makeApiDetailResponse(detail));
    mockQueryOne.mockReturnValue(null);
    mockExecute.mockReturnValue(1);

    await expandMeetingDetails(20);

    const actionInsert = mockExecute.mock.calls.find(c =>
      (c[0] as string).includes('INSERT INTO action_items')
    );
    expect(actionInsert).toBeTruthy();
    const params = actionInsert![1] as unknown[];
    expect(params[3]).toBe('Follow up on proposal');
  });

  it('handles action items with title instead of text', async () => {
    mockQueryAll.mockReturnValueOnce([
      { id: 'local-1', readai_meeting_id: 'r1', company_id: 'c1' },
    ]);

    const detail = makeMeetingDetailResponse({
      action_items: [
        { title: 'Schedule follow-up', assignee: { name: 'Bob' }, completed: false },
      ],
    });
    mockFetch.mockResolvedValueOnce(makeApiDetailResponse(detail));
    mockQueryOne.mockReturnValue(null);
    mockExecute.mockReturnValue(1);

    await expandMeetingDetails(20);

    const actionInsert = mockExecute.mock.calls.find(c =>
      (c[0] as string).includes('INSERT INTO action_items')
    );
    const params = actionInsert![1] as unknown[];
    expect(params[3]).toBe('Schedule follow-up');
  });

  it('handles string assignee (not object)', async () => {
    mockQueryAll.mockReturnValueOnce([
      { id: 'local-1', readai_meeting_id: 'r1', company_id: 'c1' },
    ]);

    const detail = makeMeetingDetailResponse({
      action_items: [
        { text: 'Do the thing', assignee: 'Charlie', completed: false },
      ],
    });
    mockFetch.mockResolvedValueOnce(makeApiDetailResponse(detail));
    mockQueryOne.mockReturnValue(null);
    mockExecute.mockReturnValue(1);

    await expandMeetingDetails(20);

    const actionInsert = mockExecute.mock.calls.find(c =>
      (c[0] as string).includes('INSERT INTO action_items')
    );
    const params = actionInsert![1] as unknown[];
    expect(params[4]).toBe('Charlie'); // assignee as string
  });

  it('handles dueDate (camelCase) as well as due_date', async () => {
    mockQueryAll.mockReturnValueOnce([
      { id: 'local-1', readai_meeting_id: 'r1', company_id: 'c1' },
    ]);

    const detail = makeMeetingDetailResponse({
      action_items: [
        { text: 'Task with camelCase date', assignee: { name: 'Dan' }, completed: false, dueDate: '2024-03-01' },
      ],
    });
    mockFetch.mockResolvedValueOnce(makeApiDetailResponse(detail));
    mockQueryOne.mockReturnValue(null);
    mockExecute.mockReturnValue(1);

    await expandMeetingDetails(20);

    const actionInsert = mockExecute.mock.calls.find(c =>
      (c[0] as string).includes('INSERT INTO action_items')
    );
    const params = actionInsert![1] as unknown[];
    expect(params[6]).toBe('2024-03-01'); // due_date from dueDate
  });
});

// ────────────────────────────────────────────────────────────────────
// Auth token usage
// ────────────────────────────────────────────────────────────────────

describe('Auth token usage', () => {
  it('uses Bearer token from getValidReadAiToken', async () => {
    mockGetValidReadAiToken.mockResolvedValue('my-special-token');
    mockFetch.mockResolvedValueOnce(makeApiListResponse([], false));

    await syncMeetingsList(1);

    const fetchCall = mockFetch.mock.calls[0];
    const init = fetchCall[1] as RequestInit;
    expect(init.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer my-special-token',
      })
    );
  });

  it('re-fetches token on rate limit retry', async () => {
    mockGetValidReadAiToken
      .mockResolvedValueOnce('token-precheck')  // pre-check in syncMeetingsList
      .mockResolvedValueOnce('token-1')          // readaiFetch first call
      .mockResolvedValueOnce('token-2-fresh');   // readaiFetch retry after 429

    mockFetch
      .mockResolvedValueOnce(makeRateLimitResponse('1'))
      .mockResolvedValueOnce(makeApiListResponse([], false));

    await syncMeetingsList(1);

    // 3 calls: pre-check + first fetch + retry
    expect(mockGetValidReadAiToken).toHaveBeenCalledTimes(3);
    const retryInit = mockFetch.mock.calls[1][1] as RequestInit;
    expect((retryInit.headers as Record<string, string>).Authorization).toBe('Bearer token-2-fresh');
  });

  it('propagates auth errors', async () => {
    mockGetValidReadAiToken.mockRejectedValue(new Error('Read.ai not authorized'));

    await expect(syncMeetingsList(1)).rejects.toThrow('Read.ai not authorized');
  });
});
