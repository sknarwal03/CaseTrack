const PWA_BASE = "/CaseTrack/";
const isLocalDevelopment = import.meta.env.DEV &&
  (location.hostname === "localhost" || location.hostname === "127.0.0.1");

if ("serviceWorker" in navigator && location.pathname.startsWith(PWA_BASE)) {
  window.addEventListener("load", async () => {
    if (isLocalDevelopment) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations
          .filter(registration => new URL(registration.scope).pathname === PWA_BASE)
          .map(registration => registration.unregister()));
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames
          .filter(cacheName => cacheName.startsWith("casetrack-"))
          .map(cacheName => caches.delete(cacheName)));
      } catch (error) {
        console.error("CaseTrack development cache could not be cleared:", error);
      }
      return;
    }

    navigator.serviceWorker.register(`${PWA_BASE}sw.js`, { scope: PWA_BASE }).catch(error => {
      console.error("CaseTrack offline support could not start:", error);
    });
  });
}
