ALTER TABLE companies ADD COLUMN contacts_added_7d INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN contacts_added_30d INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN contacts_added_90d INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN contacts_added_365d INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN messages_synced_total INTEGER DEFAULT 0;
ALTER TABLE sync_runs ADD COLUMN detail_json TEXT;
