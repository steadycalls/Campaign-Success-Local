import { registerDBHandlers } from './db';
import { registerSettingsHandlers } from './settings';
import { registerSyncHandlers } from './sync';
import { registerSubAccountHandlers } from './subaccounts';
import { registerAssociationHandlers } from './associations';
import { registerQueueHandlers } from './queue';
import { registerRagHandlers } from './rag';

export function registerIPCHandlers(): void {
  registerDBHandlers();
  registerSettingsHandlers();
  registerSyncHandlers();
  registerSubAccountHandlers();
  registerAssociationHandlers();
  registerQueueHandlers();
  registerRagHandlers();
}
