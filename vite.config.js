import { defineConfig } from "vite";
import { resolve } from "path";

const projectRoot = import.meta.dirname;

export default defineConfig(({ mode, command }) => {
  if (mode === "role-admin-local" && command !== "serve") {
    throw new Error("role-admin-local is available only with the Vite development server.");
  }

  return ({
  base: "/CaseTrack/",

  resolve: {
    alias: {
      "@config": mode === "role-admin-local" && command === "serve"
        ? resolve(projectRoot, "firebase/local-role-admin")
        : resolve(projectRoot, "firebase")
    }
  },

  build: {
    rollupOptions: {
      input: {
        main: resolve(projectRoot, "index.html"),
        login: resolve(projectRoot, "pages/login.html"),
        dashboard: resolve(projectRoot, "pages/dashboard.html"),
        cases: resolve(projectRoot, "pages/cases.html"),
        calendar: resolve(projectRoot, "pages/calendar.html"),
        poCases: resolve(projectRoot, "pages/po-cases.html"),
        report: resolve(projectRoot, "pages/report.html"),
        settings: resolve(projectRoot, "pages/settings.html"),
        adminPanel: resolve(projectRoot, "pages/admin-panel.html"),
        passwordSetup: resolve(projectRoot, "pages/password-setup.html"),
        registerDiary: resolve(projectRoot, "pages/register-diary.html"),
        allJudges: resolve(projectRoot, "pages/all-judges.html"),
        manageIo: resolve(projectRoot, "pages/manage-io.html")
      }
    }
  }
  });
});
