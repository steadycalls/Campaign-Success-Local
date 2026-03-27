-- Link Kinsta sites to multiple clients (contacts tagged as 'client')

CREATE TABLE IF NOT EXISTS kinsta_site_clients (
  id                TEXT PRIMARY KEY,
  kinsta_site_id    TEXT NOT NULL REFERENCES kinsta_sites(id) ON DELETE CASCADE,
  client_contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(kinsta_site_id, client_contact_id)
);

CREATE INDEX IF NOT EXISTS idx_kinsta_site_clients_site ON kinsta_site_clients(kinsta_site_id);
CREATE INDEX IF NOT EXISTS idx_kinsta_site_clients_client ON kinsta_site_clients(client_contact_id);
