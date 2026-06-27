import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!existsSync(join(__dirname, 'node_modules', 'express'))) {
  console.log('[BOOT] Installing dependencies...');
  execSync('npm install --omit=dev', { cwd: __dirname, stdio: 'inherit' });
  console.log('[BOOT] Dependencies installed.');
}

await import('./api/server.js');
