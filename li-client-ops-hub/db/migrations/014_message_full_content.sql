ALTER TABLE messages ADD COLUMN body_full TEXT;
ALTER TABLE messages ADD COLUMN subject TEXT;
ALTER TABLE messages ADD COLUMN call_duration INTEGER;
ALTER TABLE messages ADD COLUMN call_status TEXT;
ALTER TABLE messages ADD COLUMN call_recording_url TEXT;
ALTER TABLE messages ADD COLUMN has_attachments INTEGER DEFAULT 0;
ALTER TABLE messages ADD COLUMN attachment_count INTEGER DEFAULT 0;
