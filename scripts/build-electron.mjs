import * as esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';

const root = process.cwd();
const outDir = path.join(root, 'dist-electron');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function buildElectron() {
  console.log('Building Electron TypeScript files...');

  const common = {
    platform: 'node',
    target: 'node20',
    bundle: true,
    sourcemap: true,
    format: 'cjs',
    external: [
      'electron',
      'better-sqlite3',
      'pdf-parse',
      'mammoth',
      'chokidar',
      'nodemailer',
      'sanitize-html',
    ],
  };

  await Promise.all([
    esbuild.build({
      ...common,
      entryPoints: [path.join(root, 'electron/main.ts')],
      outfile: path.join(outDir, 'main.js'),
    }),
    esbuild.build({
      ...common,
      entryPoints: [path.join(root, 'electron/preload.ts')],
      outfile: path.join(outDir, 'preload.js'),
    }),
    esbuild.build({
      ...common,
      entryPoints: [path.join(root, 'electron/indexer-worker.ts')],
      outfile: path.join(outDir, 'indexer-worker.js'),
    }),
  ]);

  console.log('Electron build complete: dist-electron/');
}

buildElectron().catch((err) => {
  console.error('Electron build failed:', err);
  process.exit(1);
});
