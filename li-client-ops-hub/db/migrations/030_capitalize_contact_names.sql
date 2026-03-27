-- Capitalize existing contact first/last names (Title Case)
-- SQLite doesn't have a built-in title case function, but we can uppercase the first letter
-- of names that are all lowercase. The sync adapter now applies titleCase on ingest.

UPDATE contacts SET
  first_name = UPPER(SUBSTR(first_name, 1, 1)) || LOWER(SUBSTR(first_name, 2))
WHERE first_name IS NOT NULL AND first_name != '' AND first_name = LOWER(first_name);

UPDATE contacts SET
  last_name = UPPER(SUBSTR(last_name, 1, 1)) || LOWER(SUBSTR(last_name, 2))
WHERE last_name IS NOT NULL AND last_name != '' AND last_name = LOWER(last_name);
