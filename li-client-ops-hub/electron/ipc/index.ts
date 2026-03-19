import { registerDBHandlers } from './db';
import { registerSettingsHandlers } from './settings';
import { registerSyncHandlers } from './sync';
import { registerSubAccountHandlers } from './subaccounts';
import { registerAssociationHandlers } from './associations';
import { registerQueueHandlers } from './queue';
import { registerRagHandlers } from './rag';
import { registerGdriveHandlers } from './gdrive';
import { registerBriefingHandlers } from './briefing';
import { registerCloudHandlers } from './cloud';
import { registerCalendarHandlers } from './calendar';
import { registerHealthHandlers } from './health';

export function registerIPCHandlers(): void {
  registerDBHandlers();
  registerSettingsHandlers();
  registerSyncHandlers();
  registerSubAccountHandlers();
  registerAssociationHandlers();
  registerQueueHandlers();
  registerRagHandlers();
  registerGdriveHandlers();
  registerBriefingHandlers();
  registerCloudHandlers();
  registerCalendarHandlers();
  registerHealthHandlers();
}
