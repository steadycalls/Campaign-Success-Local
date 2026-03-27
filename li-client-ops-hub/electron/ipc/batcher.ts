import type { BrowserWindow } from 'electron';

interface BatchConfig {
  flushIntervalMs: number;
  maxBatchSize: number;
}

const DEFAULT_CONFIG: BatchConfig = {
  flushIntervalMs: 500,
  maxBatchSize: 50,
};

class IPCBatcher {
  private buffers: Map<string, unknown[]> = new Map();
  private timer: ReturnType<typeof setInterval> | null = null;
  private window: BrowserWindow | null = null;
  private config: BatchConfig;

  constructor(config: Partial<BatchConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setWindow(win: BrowserWindow) {
    this.window = win;
  }

  /**
   * Queue an event instead of sending immediately.
   * Events are batched by channel name and flushed periodically.
   */
  send(channel: string, data: unknown) {
    if (!this.buffers.has(channel)) {
      this.buffers.set(channel, []);
    }

    const buffer = this.buffers.get(channel)!;
    buffer.push(data);

    // Force flush if buffer is getting large
    if (buffer.length >= this.config.maxBatchSize) {
      this.flush();
    }

    // Start periodic flush timer if not running
    if (!this.timer) {
      this.timer = setInterval(() => this.flush(), this.config.flushIntervalMs);
    }
  }

  /**
   * For time-critical channels (e.g., notifications), bypass batching.
   */
  sendImmediate(channel: string, data: unknown) {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, data);
    }
  }

  flush() {
    if (!this.window || this.window.isDestroyed()) return;

    for (const [channel, events] of this.buffers.entries()) {
      if (events.length === 0) continue;

      this.window.webContents.send(`${channel}:batch`, events);
      this.buffers.set(channel, []);
    }

    // Stop timer if all buffers are empty
    const allEmpty = Array.from(this.buffers.values()).every(b => b.length === 0);
    if (allEmpty && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  destroy() {
    if (this.timer) clearInterval(this.timer);
    this.buffers.clear();
    this.window = null;
  }
}

export const ipcBatcher = new IPCBatcher();
