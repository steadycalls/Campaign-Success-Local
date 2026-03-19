import { ipcMain, app } from 'electron';
import path from 'path';
import fs from 'fs';
import { queryAll, queryOne } from '../../db/client';
import { scanAndChunkAllSources, embedPendingChunks, ragSearch, getRagTotals } from '../../rag/pipeline';

export function registerRagHandlers(): void {
  ipcMain.handle('rag:getStats', () => {
    const sources = queryAll('SELECT * FROM rag_processing_stats ORDER BY source_type');
    const totals = getRagTotals();
    return { sources, totals };
  });

  ipcMain.handle('rag:processNow', async () => {
    const scanResults = await scanAndChunkAllSources();
    const embedResult = await embedPendingChunks(50);
    return { scanResults, embedResult };
  });

  ipcMain.handle('rag:search', async (_e, query: string, filters?: { companyId?: string; sourceType?: string; limit?: number }) => {
    return ragSearch(query, filters?.limit ?? 10, filters);
  });

  ipcMain.handle('rag:clearAll', () => {
    const { execute } = require('../../db/client');
    execute('DELETE FROM rag_chunks');
    execute('DELETE FROM rag_processing_stats');
    return { success: true };
  });

  ipcMain.handle('rag:getStorageStats', () => {
    const userData = app.getPath('userData');
    const dbPath = path.join(userData, 'data', 'ops-hub.db');
    let dbSize = 0;
    try { dbSize = fs.statSync(dbPath).size; } catch { /* */ }

    const vecSize = queryOne('SELECT SUM(length(embedding_vector)) as bytes FROM rag_chunks WHERE embedding_vector IS NOT NULL');
    const contentSize = queryOne('SELECT SUM(length(content)) as bytes FROM rag_chunks');

    return {
      dbTotalBytes: dbSize,
      vectorBytes: (vecSize?.bytes as number) ?? 0,
      contentBytes: (contentSize?.bytes as number) ?? 0,
    };
  });
}
