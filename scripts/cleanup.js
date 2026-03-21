import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Remove node_modules
const nodeModulesPath = path.join(projectRoot, 'node_modules');
if (fs.existsSync(nodeModulesPath)) {
  console.log('[v0] Removing node_modules...');
  fs.rmSync(nodeModulesPath, { recursive: true, force: true });
  console.log('[v0] node_modules removed');
}

// Remove pnpm-lock.yaml
const lockfilePath = path.join(projectRoot, 'pnpm-lock.yaml');
if (fs.existsSync(lockfilePath)) {
  console.log('[v0] Removing pnpm-lock.yaml...');
  fs.unlinkSync(lockfilePath);
  console.log('[v0] pnpm-lock.yaml removed');
}

console.log('[v0] Cleanup complete. Dependencies ready for clean reinstall.');
