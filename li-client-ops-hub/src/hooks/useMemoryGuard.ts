import { useEffect } from 'react';

interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

/**
 * Monitors renderer process memory usage.
 * If heap usage exceeds threshold, dispatches a 'memory-pressure' event
 * so pages can drop caches and reduce work.
 */
export function useMemoryGuard(thresholdMB: number = 512) {
  useEffect(() => {
    const check = setInterval(() => {
      const perf = performance as Performance & { memory?: PerformanceMemory };
      if (perf.memory) {
        const usedMB = perf.memory.usedJSHeapSize / (1024 * 1024);
        if (usedMB > thresholdMB) {
          console.warn(`[MemoryGuard] Heap at ${usedMB.toFixed(0)}MB, exceeds ${thresholdMB}MB threshold`);
          window.dispatchEvent(new CustomEvent('memory-pressure'));
        }
      }
    }, 10000);

    return () => clearInterval(check);
  }, [thresholdMB]);
}
