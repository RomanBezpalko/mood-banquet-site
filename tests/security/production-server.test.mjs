import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const projectRoot = path.resolve(process.cwd());

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function waitForServer(url, child, logs) {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    if (child.exitCode !== null) throw new Error(`Production server exited: ${logs.join('')}`);
    try {
      const response = await fetch(url);
      if (response.status > 0) return;
    } catch {
      // The server is still starting.
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for production server: ${logs.join('')}`);
}

test('production server protects static files and sends security headers', async t => {
  const port = await getFreePort();
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'mood-production-security-'));
  const staleTemp = path.join(dataDir, 'leads.json.12345.00000000-0000-0000-0000-000000000000.tmp');
  await writeFile(staleTemp, '{}', 'utf8');
  const staleDate = new Date('2020-01-01T00:00:00.000Z');
  await utimes(staleTemp, staleDate, staleDate);
  const baseUrl = `http://127.0.0.1:${port}`;
  const logs = [];
  await writeFile(path.join(dataDir, 'leads.json'), '{ invalid json', 'utf8');
  const child = spawn(process.execPath, ['server.mjs', '--production'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      APP_ORIGIN: baseUrl,
      MOOD_DATA_DIR: dataDir,
      MOOD_DATA_ENCRYPTION_KEY: '22'.repeat(32),
      MOOD_TEST_MODE: 'false',
      TELEGRAM_BOT_TOKEN: '',
      TELEGRAM_CHAT_ID: '',
      TELEGRAM_GROUP_CHAT_ID: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => logs.push(chunk.toString()));
  child.stderr.on('data', chunk => logs.push(chunk.toString()));

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        delay(3_000)
      ]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    await rm(dataDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl, child, logs);

  await t.test('homepage includes security headers', async () => {
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(response.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
    const csp = response.headers.get('content-security-policy');
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /img-src 'self' data: https:\/\/images\.unsplash\.com/);
    assert.match(csp, /font-src 'self' https:\/\/fonts\.gstatic\.com/);
    assert.match(csp, /object-src 'none'/);
  });

  await t.test('serves the production bundle with safe method and content type handling', async () => {
    const distFiles = await readdir(path.join(projectRoot, 'dist', 'assets'));
    const script = distFiles.find(file => file.endsWith('.js'));
    assert.ok(script, 'production JavaScript bundle should exist');

    const asset = await fetch(`${baseUrl}/assets/${script}`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type') || '', /javascript/);
    assert.equal(asset.headers.get('x-content-type-options'), 'nosniff');

    const head = await fetch(`${baseUrl}/assets/${script}`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  });

  await t.test('quarantines corrupt storage instead of silently deleting it', async () => {
    const files = await readdir(dataDir);
    assert.ok(files.some(file => file.startsWith('leads.json.corrupt-')));
    assert.equal(files.includes(path.basename(staleTemp)), false);
    assert.match(logs.join(''), /Corrupt storage moved to .*leads\.json\.corrupt-/);
  });

  await t.test('rejects unsupported methods', async () => {
    const response = await fetch(`${baseUrl}/`, { method: 'POST' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
  });

  await t.test('does not serve files outside dist', async () => {
    for (const pathname of ['/%2e%2e/server.mjs', '/%2e%2e/package.json', '/data/leads.json']) {
      const response = await fetch(`${baseUrl}${pathname}`);
      assert.notEqual(response.status, 200, pathname);
      const body = await response.text();
      assert.doesNotMatch(body, /TELEGRAM_BOT_TOKEN|MOOD_DATA_DIR|"leads"/i, pathname);
    }
  });

  await t.test('does not expose test diagnostics in production', async () => {
    const response = await fetch(`${baseUrl}/__test/state`);
    assert.equal(response.status, 404);
  });

  await t.test('keeps security headers on missing static files', async () => {
    const response = await fetch(`${baseUrl}/assets/missing.js`);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
  });
});
