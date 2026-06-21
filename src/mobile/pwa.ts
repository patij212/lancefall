// Mobile PWA glue — best-effort, every call guarded. Registers a minimal offline service
// worker, requests fullscreen on the FIRST touch, and tries to lock landscape. Unsupported
// platforms (notably iOS) silently degrade. Called only from the isMobile mount path, so
// nothing here ever runs on desktop.

export function initPwa(): void {
  registerServiceWorker();
  setupFullscreenOnFirstTouch();
}

function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // Register after load so it never competes with game boot for the main thread.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline cache simply unavailable — the game runs fine online */
    });
  });
}

function setupFullscreenOnFirstTouch(): void {
  window.addEventListener(
    'touchend',
    () => {
      try {
        const el = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
        const p = el.requestFullscreen?.();
        if (p && typeof p.then === 'function') p.then(lockLandscape).catch(() => {});
      } catch {
        /* fullscreen denied / unsupported */
      }
    },
    { once: true, passive: true },
  );
}

function lockLandscape(): void {
  try {
    const o = screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> };
    o.lock?.('landscape').catch(() => {
      /* orientation lock unsupported (iOS) — the rotate-hint covers portrait */
    });
  } catch {
    /* ignore */
  }
}
