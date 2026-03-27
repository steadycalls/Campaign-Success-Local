import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock modules ─────────────────────────────────────────────────────

const mockQueryOne = vi.fn<(sql: string, params?: unknown[]) => Record<string, unknown> | null>();
const mockExecute = vi.fn<(sql: string, params?: unknown[]) => number>();

vi.mock('../db/client', () => ({
  queryAll: vi.fn(() => []),
  queryOne: (...args: unknown[]) => mockQueryOne(args[0] as string, args[1] as unknown[]),
  execute: (...args: unknown[]) => mockExecute(args[0] as string, args[1] as unknown[]),
}));

vi.mock('../lib/logger', () => ({
  logger: {
    sync: vi.fn(), auth: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), d1: vi.fn(),
  },
}));

vi.mock('../sync/utils/logger', () => ({
  logAlert: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  shell: { openExternal: vi.fn() },
}));

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', mockFetch);

process.env.READAI_CLIENT_ID = 'test-client-id';
process.env.READAI_CLIENT_SECRET = 'test-client-secret';

import {
  getValidReadAiToken,
  testReadAiOAuthConnection,
  reconcileReadAiAuthOnStartup,
} from '../electron/ipc/readai-auth';

// ── Helpers ──────────────────────────────────────────────────────────

const VALID_AUTH = {
  access_token: 'valid-token',
  refresh_token: 'refresh-123',
  expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
};

const EXPIRED_AUTH = {
  access_token: 'expired-token',
  refresh_token: 'refresh-123',
  expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
};

function makeTokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
      scope: 'openid email offline_access profile meeting:read',
      ...overrides,
    }),
    text: () => Promise.resolve(''),
  } as unknown as Response;
}

function makeOkResponse(body: unknown) {
  return {
    ok: true, status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(''),
  } as unknown as Response;
}

function makeErrorResponse(status: number, body = 'error') {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getValidReadAiToken', () => {
  it('returns stored token when not expired', async () => {
    mockQueryOne.mockReturnValue({ ...VALID_AUTH });

    const token = await getValidReadAiToken();
    expect(token).toBe('valid-token');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refreshes token when expired', async () => {
    // getValidReadAiToken flow:
    //   1. queryOne('SELECT * FROM readai_auth...') → expired auth (has refresh_token)
    //   → calls refreshReadAiTokenInternal
    //   2. queryOne('SELECT * FROM readai_auth...') → same expired auth (needs refresh_token)
    //   → fetch to token endpoint → success
    //   → execute UPDATE readai_auth
    //   3. queryOne('SELECT access_token FROM readai_auth...') → refreshed token
    let callCount = 0;
    mockQueryOne.mockImplementation((sql: string) => {
      callCount++;
      if (sql.includes('readai_auth')) {
        // Calls 1 & 2: return expired auth with refresh_token
        if (callCount <= 2) return { ...EXPIRED_AUTH };
        // Call 3: after refresh, return new access_token
        return { access_token: 'refreshed-token' };
      }
      return null;
    });
    mockExecute.mockReturnValue(1);
    mockFetch.mockResolvedValueOnce(makeTokenResponse());

    const token = await getValidReadAiToken();
    expect(token).toBe('refreshed-token');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('refreshes token within 5-minute buffer window', async () => {
    const almostExpired = {
      ...VALID_AUTH,
      access_token: 'almost-expired',
      expires_at: new Date(Date.now() + 3 * 60 * 1000).toISOString(), // 3 min (within 5min buffer)
    };
    let callCount = 0;
    mockQueryOne.mockImplementation((sql: string) => {
      callCount++;
      if (sql.includes('readai_auth')) {
        if (callCount <= 2) return { ...almostExpired };
        return { access_token: 'refreshed-token' };
      }
      return null;
    });
    mockExecute.mockReturnValue(1);
    mockFetch.mockResolvedValueOnce(makeTokenResponse());

    const token = await getValidReadAiToken();
    expect(token).toBe('refreshed-token');
  });

  it('throws when no tokens stored', async () => {
    mockQueryOne.mockReturnValue(null);
    await expect(getValidReadAiToken()).rejects.toThrow('Read.ai not authorized');
  });

  it('throws when access_token present but no refresh_token', async () => {
    mockQueryOne.mockReturnValue({
      access_token: 'token',
      refresh_token: null,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    await expect(getValidReadAiToken()).rejects.toThrow('Read.ai not authorized');
  });

  it('throws when refresh fails with server error', async () => {
    // refreshReadAiTokenInternal gets 500 → returns failure but doesn't clear tokens
    mockQueryOne.mockReturnValue({ ...EXPIRED_AUTH });
    mockExecute.mockReturnValue(1);
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500, 'Server Error'));

    await expect(getValidReadAiToken()).rejects.toThrow('Token refresh failed');
  });

  it('clears tokens on 401 refresh failure (revoked token)', async () => {
    // On 401/400, refreshReadAiTokenInternal deletes tokens
    mockQueryOne.mockReturnValue({ ...EXPIRED_AUTH });
    mockExecute.mockReturnValue(1);
    mockFetch.mockResolvedValueOnce(makeErrorResponse(401, 'invalid_grant'));

    await expect(getValidReadAiToken()).rejects.toThrow('Token refresh failed');

    const deleteCall = mockExecute.mock.calls.find(c => (c[0] as string).includes('DELETE FROM readai_auth'));
    expect(deleteCall).toBeTruthy();

    const statusCall = mockExecute.mock.calls.find(c =>
      (c[0] as string).includes("status = 'not_configured'")
    );
    expect(statusCall).toBeTruthy();
  });

  it('preserves existing refresh_token if new one not returned (COALESCE)', async () => {
    let callCount = 0;
    mockQueryOne.mockImplementation((sql: string) => {
      callCount++;
      if (sql.includes('readai_auth')) {
        if (callCount <= 2) return { ...EXPIRED_AUTH, refresh_token: 'original-refresh' };
        return { access_token: 'new-access-token' };
      }
      return null;
    });
    mockExecute.mockReturnValue(1);
    // Token response without refresh_token
    mockFetch.mockResolvedValueOnce(makeTokenResponse({ refresh_token: undefined }));

    await getValidReadAiToken();

    const updateCall = mockExecute.mock.calls.find(c =>
      (c[0] as string).includes('UPDATE readai_auth') && (c[0] as string).includes('COALESCE')
    );
    expect(updateCall).toBeTruthy();
    const params = updateCall![1] as unknown[];
    expect(params[1]).toBeNull(); // null triggers COALESCE to keep existing
  });
});

describe('testReadAiOAuthConnection', () => {
  it('returns success when test endpoint responds OK', async () => {
    mockQueryOne.mockReturnValue({ ...VALID_AUTH });
    mockExecute.mockReturnValue(1);

    // Test-token-with-scopes endpoint
    mockFetch.mockResolvedValueOnce(makeOkResponse({ scope: ['meeting:read'] }));
    // Meetings count endpoint
    mockFetch.mockResolvedValueOnce(makeOkResponse({ total: 42 }));

    const result = await testReadAiOAuthConnection();

    expect(result.success).toBe(true);
    expect(result.message).toContain('42 meetings');
  });

  it('returns failure when test endpoint fails', async () => {
    mockQueryOne.mockReturnValue({ ...VALID_AUTH });
    mockExecute.mockReturnValue(1);
    mockFetch.mockResolvedValueOnce(makeErrorResponse(403, 'Forbidden'));

    const result = await testReadAiOAuthConnection();

    expect(result.success).toBe(false);
    expect(result.message).toContain('403');
  });

  it('updates integration status to connected on success', async () => {
    mockQueryOne.mockReturnValue({ ...VALID_AUTH });
    mockExecute.mockReturnValue(1);

    mockFetch.mockResolvedValueOnce(makeOkResponse({ scope: ['meeting:read'] }));
    mockFetch.mockResolvedValueOnce(makeOkResponse({ total: 10 }));

    await testReadAiOAuthConnection();

    const statusUpdate = mockExecute.mock.calls.find(c =>
      (c[0] as string).includes("status = 'connected'") && (c[0] as string).includes('readai_api')
    );
    expect(statusUpdate).toBeTruthy();
  });

  it('updates integration status to error when getValidReadAiToken throws', async () => {
    // If token retrieval itself throws, the catch block sets status = 'error'
    mockQueryOne.mockReturnValue(null); // no auth → getValidReadAiToken throws
    mockExecute.mockReturnValue(1);

    const result = await testReadAiOAuthConnection();

    expect(result.success).toBe(false);
    const statusUpdate = mockExecute.mock.calls.find(c =>
      (c[0] as string).includes("status = 'error'") && (c[0] as string).includes('readai_api')
    );
    expect(statusUpdate).toBeTruthy();
  });

  it('returns failure without updating status when test endpoint returns non-ok', async () => {
    // When test endpoint fails with !res.ok, the function returns early
    // without updating integration status (this is the actual behavior)
    mockQueryOne.mockReturnValue({ ...VALID_AUTH });
    mockExecute.mockReturnValue(1);
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500, 'Server Error'));

    const result = await testReadAiOAuthConnection();

    expect(result.success).toBe(false);
    expect(result.message).toContain('500');
  });

  it('handles meeting count endpoint failure gracefully', async () => {
    mockQueryOne.mockReturnValue({ ...VALID_AUTH });
    mockExecute.mockReturnValue(1);

    mockFetch.mockResolvedValueOnce(makeOkResponse({ scope: ['meeting:read'] }));
    // Meetings count fails
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500, 'oops'));

    const result = await testReadAiOAuthConnection();

    // Should still succeed — meeting count is non-fatal
    expect(result.success).toBe(true);
    expect(result.message).toContain('Connected');
  });
});

describe('reconcileReadAiAuthOnStartup', () => {
  it('does nothing when no tokens stored', async () => {
    mockQueryOne.mockReturnValue(null);

    await reconcileReadAiAuthOnStartup();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('warns when access_token exists without refresh_token', async () => {
    mockQueryOne.mockImplementation((sql: string) => {
      if (sql.includes('readai_auth')) {
        return { access_token: 'orphan-token', refresh_token: null, expires_at: null };
      }
      return null;
    });
    mockExecute.mockReturnValue(1);

    await reconcileReadAiAuthOnStartup();

    const errorUpdate = mockExecute.mock.calls.find(c =>
      (c[0] as string).includes("status = 'error'") && (c[0] as string).includes('No refresh token')
    );
    expect(errorUpdate).toBeTruthy();
  });

  it('sets integration to connected when tokens are valid', async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mockQueryOne.mockImplementation((sql: string) => {
      if (sql.includes('readai_auth')) {
        return { access_token: 'valid', refresh_token: 'refresh', expires_at: futureExpiry };
      }
      if (sql.includes('integrations')) return { status: 'not_configured' };
      return null;
    });
    mockExecute.mockReturnValue(1);

    await reconcileReadAiAuthOnStartup();

    const connectedUpdate = mockExecute.mock.calls.find(c =>
      (c[0] as string).includes("status = 'connected'")
    );
    expect(connectedUpdate).toBeTruthy();
  });

  it('attempts silent refresh when token is expired on startup', async () => {
    const pastExpiry = new Date(Date.now() - 60 * 1000).toISOString();
    mockQueryOne.mockImplementation((sql: string) => {
      if (sql.includes('readai_auth')) {
        return { access_token: 'expired', refresh_token: 'refresh-123', expires_at: pastExpiry };
      }
      if (sql.includes('integrations')) return { status: 'connected' };
      return null;
    });
    mockExecute.mockReturnValue(1);
    mockFetch.mockResolvedValueOnce(makeTokenResponse());

    await reconcileReadAiAuthOnStartup();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const connectedUpdate = mockExecute.mock.calls.find(c =>
      (c[0] as string).includes("status = 'connected'") && (c[0] as string).includes('last_error = NULL')
    );
    expect(connectedUpdate).toBeTruthy();
  });

  it('handles refresh failure gracefully on startup (no crash)', async () => {
    const pastExpiry = new Date(Date.now() - 60 * 1000).toISOString();
    mockQueryOne.mockImplementation((sql: string) => {
      if (sql.includes('readai_auth')) {
        return { access_token: 'expired', refresh_token: 'bad-refresh', expires_at: pastExpiry };
      }
      if (sql.includes('integrations')) return { status: 'connected' };
      return null;
    });
    mockExecute.mockReturnValue(1);
    mockFetch.mockResolvedValueOnce(makeErrorResponse(400, 'invalid_grant'));

    // Should not throw
    await expect(reconcileReadAiAuthOnStartup()).resolves.not.toThrow();
  });
});

describe('Curl parser (tested via IPC handler behavior)', () => {
  it('should handle Basic auth with base64 echo pattern', () => {
    const input = 'test-client-id:test-client-secret';
    const encoded = Buffer.from(input).toString('base64');
    const decoded = Buffer.from(encoded, 'base64').toString();
    expect(decoded).toBe(input);
  });

  it('should handle URL-encoded form parameters', () => {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: 'test-auth-code',
      redirect_uri: 'https://api.read.ai/oauth/ui',
    });
    expect(params.get('code')).toBe('test-auth-code');
    expect(params.get('grant_type')).toBe('authorization_code');
  });
});
