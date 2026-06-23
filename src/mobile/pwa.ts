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
  const stop = (): void => window.removeEventListener('touchend', tryFullscreen);
  function tryFullscreen(): void {
    if (document.fullscreenElement) {
      stop();
      return;
    }
    const el = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
    if (!el.requestFullscreen) {
      stop(); // unsupported (notably iOS in-browser) — the rotate-hint + installed PWA cover it
      return;
    }
    try {
      el.requestFullscreen()
        .then(() => {
          lockLandscape();
          stop();
        })
        .catch(() => {
          /* this gesture was rejected — keep listening and retry on the next touch */
        });
    } catch {
      /* ignore */
    }
  }
  // Retry on EVERY touch (not just the first) so one rejected attempt doesn't permanently give up.
  window.addEventListener('touchend', tryFullscreen, { passive: true });
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
