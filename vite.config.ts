import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  root: fs.realpathSync(process.cwd()),
  server: {
    port: 5173,
    host: true,
  },
});
