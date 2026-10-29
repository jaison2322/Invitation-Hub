import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import * as esbuild from 'esbuild';

const testDir = path.resolve(process.cwd(), 'tests');
const tempDir = path.resolve(process.cwd(), '.temp_tests');

if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

if (fs.existsSync(tempDir)) {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
fs.mkdirSync(tempDir, { recursive: true });

function findTestFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(findTestFiles(fullPath));
    } else if (file.endsWith('.test.ts') || file.endsWith('.spec.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

const testFiles = findTestFiles(testDir);

if (testFiles.length === 0) {
  console.log('No test files found in tests/');
  process.exit(0);
}

console.log(`Compiling ${testFiles.length} test files with esbuild...`);

const outFiles = [];
for (const testFile of testFiles) {
  const rel = path.relative(testDir, testFile);
  const outFile = path.join(tempDir, rel.replace(/\.ts$/, '.mjs'));
  const outDir = path.dirname(outFile);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  await esbuild.build({
    entryPoints: [testFile],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile: outFile,
    external: ['@supabase/supabase-js', 'node:test', 'node:assert', 'node:assert/strict'],
    banner: {
      js: 'if (typeof globalThis.WebSocket === "undefined") { globalThis.WebSocket = class MockWebSocket {}; }\nif (typeof globalThis.localStorage === "undefined") { globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }; }',
    },
  });
  outFiles.push(outFile);
}

console.log('Running test suite with node:test...');
try {
  const args = outFiles.map(f => `"${f}"`).join(' ');
  execSync(`node --test ${args}`, { stdio: 'inherit' });
  console.log('All tests passed successfully!');
} catch (err) {
  process.exit(1);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
