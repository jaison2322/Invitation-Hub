import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';

// On Windows, if the workspace drive is a subst or junction (e.g. D: -> E:),
// path.relative across different drive letters returns an absolute path, which breaks
// Vite's dependency optimizer in dev and Rollup's HTML emitter in build.
// Aligning process.cwd() with the canonical real path ensures single-drive relative paths everywhere.
try {
  const realCwd = fs.realpathSync(process.cwd());
  if (process.cwd().toLowerCase() !== realCwd.toLowerCase()) {
    process.chdir(realCwd);
  }
} catch {
  // Ignore if realpath cannot be resolved
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
});
