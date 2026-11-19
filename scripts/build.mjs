import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as esbuild from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const distDir = join(root, 'dist');

function findTinyGo() {
  try {
    execFileSync('tinygo', ['version'], { stdio: 'ignore' });
    return 'tinygo';
  } catch {
    if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
      const pkgRoot = join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
      if (existsSync(pkgRoot)) {
        for (const entry of readdirSync(pkgRoot)) {
          if (entry.toLowerCase().includes('tinygo')) {
            const candidate = join(pkgRoot, entry, 'tinygo', 'bin', 'tinygo.exe');
            if (existsSync(candidate)) return candidate;
          }
        }
      }
    }
    throw new Error('tinygo not found on PATH');
  }
}

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

// 1. Build Go rules module to WebAssembly
const tinygo = findTinyGo();
const env = { ...process.env };
if (!env.GOTOOLCHAIN) {
  try {
    const goVer = execFileSync('go', ['version'], { encoding: 'utf8' });
    const match = goVer.match(/go1\.(\d+)/);
    if (match && Number(match[1]) > 26) {
      env.GOTOOLCHAIN = 'go1.26.0';
    }
  } catch {
    // Ignore
  }
}

execFileSync(
  tinygo,
  ['build', '-o', join(distDir, 'rules.wasm'), '-target=wasm-unknown', '-no-debug', './cmd/wasm'],
  { cwd: root, env, stdio: 'inherit' }
);

// 2. Bundle TypeScript app
await esbuild.build({
  entryPoints: [join(root, 'web', 'src', 'app.ts')],
  bundle: true,
  format: 'esm',
  minify: true,
  sourcemap: true,
  outfile: join(distDir, 'app.js'),
});

// 3. Copy static assets
for (const file of ['index.html', 'tokens.css', 'styles.css', 'manifest.webmanifest']) {
  cpSync(join(root, 'web', file), join(distDir, file));
}
cpSync(join(root, 'web', 'icons'), join(distDir, 'icons'), { recursive: true });
cpSync(join(root, 'web', 'social'), join(distDir, 'social'), { recursive: true });
cpSync(join(root, 'web', 'data'), join(distDir, 'data'), { recursive: true });

// 4. Generate cache-first service worker with content hash
const assets = [
  './',
  './index.html',
  './tokens.css',
  './styles.css',
  './app.js',
  './rules.wasm',
  './manifest.webmanifest',
  './icons/favicon.svg',
  './icons/logo-mark.svg',
  './icons/icon-maskable.svg',
  './data/lessons.json',
  './data/problems.json',
];

const hash = createHash('sha256');
for (const rel of assets) {
  if (rel === './') continue;
  const p = join(distDir, rel.slice(2));
  hash.update(rel);
  hash.update(readFileSync(p));
}
const version = hash.digest('hex').slice(0, 12);

const sw = `const CACHE_NAME = 'goodtogo-${version}';
const ASSETS = ${JSON.stringify(assets, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
`;

writeFileSync(join(distDir, 'sw.js'), sw);
console.log(`Built dist/ (sw version: goodtogo-${version})`);

// 5. Bundle Cloudflare Worker and copy byte-identical rules.wasm
const workerDist = join(root, 'worker', 'dist');
rmSync(workerDist, { recursive: true, force: true });
mkdirSync(workerDist, { recursive: true });
cpSync(join(distDir, 'rules.wasm'), join(workerDist, 'rules.wasm'));

await esbuild.build({
  entryPoints: [join(root, 'worker', 'src', 'index.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  external: ['./rules.wasm'],
  outfile: join(workerDist, 'index.js'),
});
console.log('Built worker/dist/');
