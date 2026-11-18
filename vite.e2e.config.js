import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const testProjectId = 'demo-casetrack-date-regression';

export default defineConfig({
  base: '/CaseTrack/',
  define: {
    'import.meta.env.VITE_CASETRACK_TEST_FIREBASE_PROJECT': JSON.stringify(testProjectId)
  },
  resolve: {
    alias: [
      {
        find: '@config/firebase-config.js',
        replacement: resolve(process.cwd(), 'firebase/firebase-emulator-config.js')
      },
      {
        find: './firebase-functions.js',
        replacement: resolve(process.cwd(), 'e2e/fixtures/firebase-functions.test.js')
      }
    ]
  },
  server: {
    host: '127.0.0.1',
    port: 5185,
    strictPort: true
  }
});
