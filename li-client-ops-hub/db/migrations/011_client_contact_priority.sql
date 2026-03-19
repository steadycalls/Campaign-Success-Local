ALTER TABLE sync_progress ADD COLUMN client_contacts_total INTEGER DEFAULT 0;
ALTER TABLE sync_progress ADD COLUMN client_contacts_synced INTEGER DEFAULT 0;
ALTER TABLE sync_progress ADD COLUMN client_contacts_with_messages INTEGER DEFAULT 0;
ALTER TABLE sync_progress ADD COLUMN client_contacts_sync_status TEXT DEFAULT 'not_started';
