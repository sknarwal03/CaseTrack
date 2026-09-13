import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  base: "/CaseTrack/",

  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        dashboard: resolve(__dirname, "pages/dashboard.html"),
        cases: resolve(__dirname, "pages/cases.html"),
        calendar: resolve(__dirname, "pages/calendar.html"),
        poCases: resolve(__dirname, "pages/po-cases.html"),
        report: resolve(__dirname, "pages/report.html"),
        settings: resolve(__dirname, "pages/settings.html")
      }
    }
  }
});
