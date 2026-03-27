-- Track last successful token refresh for Read.ai
ALTER TABLE readai_auth ADD COLUMN last_refreshed TEXT;
