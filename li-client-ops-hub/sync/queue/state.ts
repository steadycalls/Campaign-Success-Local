// Shared shutdown flag — avoids circular dependency between
// electron/main.ts and sync/queue/manager.ts.

let shuttingDown = false;

export function setShuttingDown(val: boolean): void { shuttingDown = val; }
export function isShuttingDown(): boolean { return shuttingDown; }
