/**
 * Sync runner interface.
 *
 * Abstracts the difference between:
 * - Local: Queue manager + direct GHL API calls + sql.js writes
 * - Cloud: Cloudflare Queues + Workers + D1 writes
 *
 * Both implementations sync data from GHL (and other sources)
 * into their respective databases.
 */

import type { SyncResult, SyncProgress } from '../types';

export interface SyncRunner {
  syncCompany(companyId: string, trigger: 'manual' | 'scheduled'): Promise<SyncResult>;
  syncAll(trigger: 'manual' | 'scheduled'): Promise<void>;
  getProgress(companyId: string): Promise<SyncProgress | null>;
}
