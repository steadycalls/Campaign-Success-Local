import http from 'http';
import { URL } from 'url';
import crypto from 'crypto';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

export interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  id_token?: string;
}

/**
 * Opens browser to Google OAuth consent screen, captures auth code via local
 * loopback server, and exchanges it for access + refresh tokens.
 */
export async function authorizeGoogleDrive(
  clientId: string,
  clientSecret: string
): Promise<GoogleTokens> {
  // Dynamic import — 'open' is ESM-only in v10+
  const open = (await import('open')).default;

  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;

      // PKCE
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

      // Build auth URL
      const authUrl = new URL(GOOGLE_AUTH_URL);
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', SCOPES.join(' '));
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');

      // Handle callback
      server.on('request', async (req, res) => {
        const url = new URL(req.url!, `http://127.0.0.1:${port}`);
        if (url.pathname !== '/oauth/callback') return;

        const error = url.searchParams.get('error');
        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(
            '<html><body><h2>Authorization failed</h2><p>You can close this window.</p></body></html>'
          );
          server.close();
          reject(new Error(`Google OAuth error: ${error}`));
          return;
        }

        const code = url.searchParams.get('code');
        if (!code) {
          res.writeHead(400);
          res.end('Missing authorization code');
          server.close();
          reject(new Error('No authorization code received'));
          return;
        }

        try {
          const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code',
              code_verifier: codeVerifier,
            }),
          });

          if (!tokenRes.ok) {
            const err = await tokenRes.text();
            throw new Error(`Token exchange failed: ${err}`);
          }

          const tokens = (await tokenRes.json()) as GoogleTokens;

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(
            '<html><body style="font-family:sans-serif;text-align:center;padding:60px">' +
              '<h2>Google Drive authorized!</h2>' +
              '<p>You can close this window and return to Client Ops Hub.</p></body></html>'
          );
          server.close();
          resolve(tokens);
        } catch (err) {
          res.writeHead(500);
          res.end('Token exchange failed');
          server.close();
          reject(err);
        }
      });

      // Open browser
      open(authUrl.toString());

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('OAuth authorization timed out (5 minutes)'));
      }, 300_000);
    });
  });
}

/**
 * Refresh an expired access token using the stored refresh token.
 */
export async function refreshGoogleToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}
