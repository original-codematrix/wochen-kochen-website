const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('self-hosting files expose persistent data and required settings', () => {
  const required = ['package.json', 'Dockerfile', 'compose.yaml', '.env.example'];
  for (const file of required) assert.ok(fs.existsSync(path.join(root, file)), `${file} fehlt`);
  const compose = fs.readFileSync(path.join(root, 'compose.yaml'), 'utf8');
  const env = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(compose, /runtime-data:\/app\/runtime-data/);
  assert.match(compose, /ipc:\s*host/);
  for (const key of ['PORT', 'DATA_DIR', 'REFRESH_TOKEN']) assert.match(env, new RegExp(`^${key}=`, 'm'));
  assert.match(dockerfile, /^FROM mcr\.microsoft\.com\/playwright:v1\.61\.0-noble$/m);
  assert.match(dockerfile, /npm ci --omit=dev/);
  assert.match(dockerfile, /^USER pwuser$/m);
  assert.equal(pkg.scripts['browser:setup'], 'node server/browser-setup.js');
});

test('README documents direct start and Friday/Saturday refresh jobs', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /npm start/);
  assert.match(readme, /Freitagabend/);
  assert.match(readme, /Samstagfrüh/);
  assert.match(readme, /api\/refresh/);
});
