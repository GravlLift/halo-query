export let isUnloading = false;

if (typeof window !== 'undefined') {
  // Early hint for leave/reload/close (no async allowed here)
  window.addEventListener('beforeunload', () => {
    isUnloading = true;
  });

  // Definitive: page is being discarded (not put in bfcache)
  window.addEventListener('pagehide', (e) => {
    if (!e.persisted) {
      isUnloading = true;
    }
  });
}
