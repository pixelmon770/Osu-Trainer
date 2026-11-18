import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// Analizator to nasz własny pakiet w TypeScripcie, więc wkompilowujemy go w program,
// zamiast traktować jak zewnętrzną zależność z node_modules.
const bundleOwnPackages = { exclude: ['@osu-trainer/analyzer'] };

export default defineConfig({
  main: {
    build: { externalizeDeps: bundleOwnPackages }
  },
  preload: {
    build: { externalizeDeps: bundleOwnPackages }
  },
  renderer: {
    plugins: [react()]
  }
});
