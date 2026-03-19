import type { ElectronAPI } from '../types';

/** Typed accessor for the preload-exposed API */
export const api: ElectronAPI = window.api;
