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

  server: command === "serve" && mode !== "role-admin-local"
    ? {
        proxy: {
          "/__production-functions": {
            target: "https://us-central1-casetrack-97a4e.cloudfunctions.net",
            changeOrigin: true,
            secure: true,
            rewrite: path => path.replace(/^\/__production-functions/, ""),
            configure: proxy => {
              proxy.on("proxyReq", proxyReq => {
                proxyReq.setHeader("origin", "https://sknarwal03.github.io");
              });
            }
          }
        }
      }
    : undefined,

  build: {
    rollupOptions: {
      input: {
        main: resolve(projectRoot, "index.html"),
        login: resolve(projectRoot, "pages/login.html"),
        dashboard: resolve(projectRoot, "pages/dashboard.html"),
        cases: resolve(projectRoot, "pages/cases.html"),
        firRegister: resolve(projectRoot, "pages/fir-register.html"),
        firIndex: resolve(projectRoot, "pages/fir-index.html"),
        disposedCases: resolve(projectRoot, "pages/disposed-cases.html"),
        poCases: resolve(projectRoot, "pages/po-cases.html"),
        report: resolve(projectRoot, "pages/report.html"),
        settings: resolve(projectRoot, "pages/settings.html"),
        adminPanel: resolve(projectRoot, "pages/admin-panel.html"),
        passwordChange: resolve(projectRoot, "pages/password-change.html"),
        registerDiary: resolve(projectRoot, "pages/register-diary.html"),
        allJudges: resolve(projectRoot, "pages/all-judges.html"),
        manageIo: resolve(projectRoot, "pages/manage-io.html")
      }
    }
  }
  });
});
