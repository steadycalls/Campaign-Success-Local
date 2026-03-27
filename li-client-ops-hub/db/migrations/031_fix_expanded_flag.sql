-- Fix meetings that had expanded reset to 0 but still have summary/transcript data
-- This restores the expanded flag for meetings that already have content
UPDATE meetings SET expanded = 1
WHERE expanded = 0
  AND (summary IS NOT NULL AND summary != ''
    OR transcript_text IS NOT NULL AND transcript_text != '');
