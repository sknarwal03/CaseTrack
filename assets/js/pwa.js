const PWA_BASE = "/CaseTrack/";

if ("serviceWorker" in navigator && location.pathname.startsWith(PWA_BASE)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${PWA_BASE}sw.js`, { scope: PWA_BASE }).catch(error => {
      console.error("CaseTrack offline support could not start:", error);
    });
  });
}
