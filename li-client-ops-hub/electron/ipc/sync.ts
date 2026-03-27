import { ipcMain } from 'electron';
import { syncCompany, syncAllCompanies, type SyncProgressData } from '../../sync/engine';
import { ipcBatcher } from './batcher';
import { resetSyncCursors } from '../../sync/utils/cursors';
import { enqueueFullCompanySync, startQueueManager } from '../../sync/queue/manager';
import { queryOne, queryAll } from '../../db/client';
import { syncContactsByTag, syncMessages, syncCustomFields, setCurrentCompanyContext } from '../../sync/adapters/ghl';
import { logSyncStart, logSyncEnd } from '../../sync/utils/logger';
import { delay } from '../../sync/utils/rateLimit';

function sendProgress(data: SyncProgressData): void {
  ipcBatcher.send('sync:progress', data);
}

export function registerSyncHandlers(): void {
  ipcMain.handle('sync:company', async (_e, companyId: string) => {
    return syncCompany(companyId, 'manual', (data) => sendProgress(data));
  });

  ipcMain.handle('sync:all', async () => {
    await syncAllCompanies('manual', (data) => sendProgress(data));
    return { success: true };
  });

  ipcMain.handle('sync:forceFullSync', async (_e, companyId: string) => {
    const company = queryOne(
      'SELECT id, name, ghl_location_id FROM companies WHERE id = ?',
      [companyId]
    );
    if (!company) return { success: false, error: 'Company not found' };

    // Reset all sync cursors to force a full re-pull
    resetSyncCursors(companyId);

    // Enqueue via the queue system with 'full' mode
    enqueueFullCompanySync(
      {
        id: company.id as string,
        name: (company.name as string) ?? '',
        ghl_location_id: company.ghl_location_id as string,
      },
      100, // high priority
      'full'
    );
    startQueueManager();

    return { success: true };
  });

  // ── Sync GHL contacts (client-tagged) + custom fields + messages across all companies ─
  ipcMain.handle('sync:contactsAll', async () => {
    const runId = logSyncStart('ghl_contacts', 'manual');
    try {
      const companies = queryAll(
        `SELECT id, name, ghl_location_id, pit_token FROM companies
         WHERE pit_status = 'valid' AND pit_token IS NOT NULL AND ghl_location_id IS NOT NULL
         ORDER BY name ASC`
      );

      let totalFound = 0;
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalMessages = 0;

      // Pass 1: Sync contacts + custom fields for each company
      for (let i = 0; i < companies.length; i++) {
        const co = companies[i];
        const companyId = co.id as string;
        const locationId = co.ghl_location_id as string;
        const pit = co.pit_token as string;
        const companyName = (co.name as string) || 'Unknown';

        setCurrentCompanyContext(companyId);

        ipcBatcher.send('sync:contactsProgress', {
          phase: 'contacts',
          companyIndex: i,
          companyTotal: companies.length,
          companyName,
          totalFound,
          totalCreated,
          percent: Math.round((i / (companies.length * 2)) * 100),
        });

        try {
          // Sync client-tagged contacts (with all fields incl custom fields JSON)
          const result = await syncContactsByTag(locationId, companyId, pit, 'client');
          totalFound += result.counts.found;
          totalCreated += result.counts.created;
          totalUpdated += result.counts.updated;

          // Sync custom field definitions for this company
          await syncCustomFields(locationId, companyId, pit);
        } catch {
          // Skip failed companies, continue with next
        }

        setCurrentCompanyContext(null);
      }

      // Pass 2: Sync messages for all client-tagged contacts
      const clientContacts = queryAll(
        `SELECT c.id, c.ghl_contact_id, c.company_id
         FROM contacts c
         WHERE c.tags LIKE '%client%' AND c.ghl_contact_id IS NOT NULL`
      );

      for (let i = 0; i < clientContacts.length; i++) {
        const contact = clientContacts[i];
        const companyId = contact.company_id as string;
        const company = queryOne('SELECT pit_token, name FROM companies WHERE id = ?', [companyId]);
        if (!company?.pit_token) continue;

        setCurrentCompanyContext(companyId);

        if (i % 10 === 0) {
          ipcBatcher.send('sync:contactsProgress', {
            phase: 'messages',
            companyIndex: companies.length + Math.round((i / clientContacts.length) * companies.length),
            companyTotal: companies.length * 2,
            companyName: (company.name as string) || '',
            totalFound,
            totalCreated,
            percent: 50 + Math.round((i / clientContacts.length) * 50),
          });
        }

        try {
          const msgResult = await syncMessages(
            contact.id as string,
            contact.ghl_contact_id as string,
            companyId,
            company.pit_token as string
          );
          totalMessages += msgResult.created;
        } catch {
          // Skip failed contacts, continue
        }

        setCurrentCompanyContext(null);
      }

      ipcBatcher.send('sync:contactsProgress', {
        phase: 'complete',
        companyIndex: companies.length * 2,
        companyTotal: companies.length * 2,
        companyName: '',
        totalFound,
        totalCreated,
        percent: 100,
      });

      logSyncEnd(runId, 'success', { found: totalFound, created: totalCreated, updated: totalUpdated });
      return {
        success: true,
        found: totalFound,
        created: totalCreated,
        updated: totalUpdated,
        messages: totalMessages,
        companies: companies.length,
        contacts: clientContacts.length,
      };
    } catch (err: unknown) {
      setCurrentCompanyContext(null);
      logSyncEnd(runId, 'error', {}, err instanceof Error ? err.message : String(err));
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Sync messages only (skip contact sync, just messages for existing client contacts) ─
  ipcMain.handle('sync:messagesOnly', async () => {
    const runId = logSyncStart('ghl_messages', 'manual');
    try {
      const clientContacts = queryAll(
        `SELECT c.id, c.ghl_contact_id, c.company_id
         FROM contacts c
         WHERE c.tags LIKE '%client%' AND c.ghl_contact_id IS NOT NULL`
      );

      let totalMessages = 0;
      let processed = 0;

      for (let i = 0; i < clientContacts.length; i++) {
        const contact = clientContacts[i];
        const companyId = contact.company_id as string;
        const company = queryOne('SELECT pit_token, name FROM companies WHERE id = ?', [companyId]);
        if (!company?.pit_token) continue;

        setCurrentCompanyContext(companyId);

        if (i % 5 === 0) {
          ipcBatcher.send('sync:contactsProgress', {
            phase: 'messages',
            companyIndex: i,
            companyTotal: clientContacts.length,
            companyName: (company.name as string) || '',
            totalFound: processed,
            totalCreated: totalMessages,
            percent: Math.round((i / clientContacts.length) * 100),
          });
        }

        try {
          const msgResult = await syncMessages(
            contact.id as string,
            contact.ghl_contact_id as string,
            companyId,
            company.pit_token as string
          );
          totalMessages += msgResult.created;
          processed++;
        } catch {
          // Skip failed contacts
        }

        setCurrentCompanyContext(null);
      }

      ipcBatcher.send('sync:contactsProgress', {
        phase: 'complete',
        companyIndex: clientContacts.length,
        companyTotal: clientContacts.length,
        companyName: '',
        totalFound: processed,
        totalCreated: totalMessages,
        percent: 100,
      });

      logSyncEnd(runId, 'success', { found: processed, created: totalMessages });
      return { success: true, contacts: processed, messages: totalMessages };
    } catch (err: unknown) {
      setCurrentCompanyContext(null);
      logSyncEnd(runId, 'error', {}, err instanceof Error ? err.message : String(err));
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  });
}
