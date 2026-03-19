// Launches Electron with ELECTRON_RUN_AS_NODE fully removed from the environment.
// This is needed because VS Code sets ELECTRON_RUN_AS_NODE=1, which prevents
// Electron from initializing its app framework.

const { spawn } = require('child_process');
const path = require('path');

const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const args = ['.', ...process.argv.slice(2)];

const child = spawn(electronPath, args, {
  stdio: 'inherit',
  env,
  cwd: path.join(__dirname, '..'),
});

child.on('exit', (code) => process.exit(code ?? 0));
