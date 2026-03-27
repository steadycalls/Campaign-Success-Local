import { ghlFetch, setCurrentCompanyContext } from '../adapters/ghl';
import { queryOne, execute } from '../../db/client';
import { logger } from '../../lib/logger';

export interface WriteBackResult {
  success: boolean;
  action: string;
  detail: string;
}

/**
 * Add a note to a GHL contact recording an accepted suggestion.
 */
export async function pushSuggestionNote(
  ghlContactId: string,
  noteBody: string,
  pit: string,
  companyId?: string,
): Promise<WriteBackResult> {
  if (companyId) setCurrentCompanyContext(companyId);
  try {
    await ghlFetch(`/contacts/${encodeURIComponent(ghlContactId)}/notes`, pit, {
      method: 'POST',
      body: JSON.stringify({ body: noteBody }),
    });
    return { success: true, action: 'note_added', detail: `Note added to contact ${ghlContactId}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('GHL', 'Failed to push suggestion note', { contactId: ghlContactId, error: msg });
    return { success: false, action: 'note_added', detail: msg };
  } finally {
    if (companyId) setCurrentCompanyContext(null);
  }
}

/**
 * Update a GHL contact's custom field value.
 */
export async function pushCustomFieldUpdate(
  ghlContactId: string,
  fieldId: string,
  value: string,
  pit: string,
  companyId?: string,
): Promise<WriteBackResult> {
  if (companyId) setCurrentCompanyContext(companyId);
  try {
    await ghlFetch(`/contacts/${encodeURIComponent(ghlContactId)}`, pit, {
      method: 'PUT',
      body: JSON.stringify({
        customFields: [{ id: fieldId, field_value: value }],
      }),
    });
    return { success: true, action: 'custom_field_update', detail: `Field ${fieldId} set on contact ${ghlContactId}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('GHL', 'Failed to push custom field update', { contactId: ghlContactId, error: msg });
    return { success: false, action: 'custom_field_update', detail: msg };
  } finally {
    if (companyId) setCurrentCompanyContext(null);
  }
}

/**
 * Build a structured note body for a suggestion.
 */
export function buildSuggestionNoteBody(
  suggestion: Record<string, unknown>,
  targetName: string,
): string {
  const signals = suggestion.signals_json
    ? JSON.parse(suggestion.signals_json as string).map((s: { signal: string; detail: string }) => s.detail).join(', ')
    : 'Unknown';

  return [
    `[Ops Hub] Auto-linked: ${targetName}`,
    `Type: ${suggestion.link_type}`,
    `Confidence: ${Math.round((suggestion.confidence as number) * 100)}%`,
    `Matched on: ${signals}`,
    `Linked at: ${new Date().toISOString()}`,
  ].join('\n');
}
