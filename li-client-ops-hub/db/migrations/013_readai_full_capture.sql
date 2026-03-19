ALTER TABLE meetings ADD COLUMN recording_local_path TEXT;
ALTER TABLE meetings ADD COLUMN live_enabled INTEGER DEFAULT 0;
ALTER TABLE meetings ADD COLUMN action_items_json TEXT;
