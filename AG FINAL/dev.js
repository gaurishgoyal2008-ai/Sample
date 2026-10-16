/**
 * Ceova AI Vision - Unified Development Launcher
 * Starts both the Python Backend Companion (Port 8000) and the Vite Frontend (Port 5173).
 */

import { spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('================================================================');
console.log('   Starting Ceova AI Vision Surveillance Platform');
console.log('   - Companion Backend: http://localhost:8000');
console.log('   - Frontend Web UI:   http://localhost:5173');
console.log('================================================================');

const isWin = process.platform === 'win32';
const pythonCmd = isWin ? 'python' : 'python3';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

const backendDir = path.join(__dirname, 'backend');
const frontendDir = path.join(__dirname, 'frontend');

// 1. Auto-install frontend dependencies if node_modules is missing
const nodeModulesDir = path.join(frontendDir, 'node_modules');
if (!fs.existsSync(nodeModulesDir)) {
  console.log('[Launcher] First run: Installing frontend dependencies (npm install)...');
  spawnSync(npmCmd, ['install'], {
    cwd: frontendDir,
    stdio: 'inherit',
    shell: isWin
  });
  console.log('[Launcher] Dependencies installed successfully.');
}

// 2. Launch Backend Companion
console.log('[Launcher] Spawning Backend Companion on http://localhost:8000 ...');
const backendProcess = spawn(pythonCmd, ['run_companion.py'], {
  cwd: backendDir,
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: isWin
});

backendProcess.stdout.on('data', (data) => {
  const lines = data.toString().trim().split('\n');
  lines.forEach(line => console.log(`\x1b[36m[Companion]\x1b[0m ${line}`));
});

backendProcess.stderr.on('data', (data) => {
  const lines = data.toString().trim().split('\n');
  lines.forEach(line => console.error(`\x1b[31m[Companion Err]\x1b[0m ${line}`));
});

// 3. Launch Frontend Dev Server
console.log('[Launcher] Spawning Frontend Dev Server on http://localhost:5173 ...');
const frontendProcess = spawn(npmCmd, ['run', 'dev'], {
  cwd: frontendDir,
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: isWin
});

frontendProcess.stdout.on('data', (data) => {
  const lines = data.toString().trim().split('\n');
  lines.forEach(line => console.log(`\x1b[32m[Frontend]\x1b[0m ${line}`));
});

frontendProcess.stderr.on('data', (data) => {
  const lines = data.toString().trim().split('\n');
  lines.forEach(line => console.error(`\x1b[33m[Frontend Err]\x1b[0m ${line}`));
});

// Clean shutdown on Ctrl+C
function cleanup() {
  console.log('\n[Launcher] Terminating processes...');
  try { backendProcess.kill(); } catch (e) {}
  try { frontendProcess.kill(); } catch (e) {}
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
