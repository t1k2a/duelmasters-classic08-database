import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { preparePrivateDirectory, writePrivateReport } from '../../scripts/ga4-private-output.js';

const root = process.cwd();
const script = path.join(root, 'scripts/ga4-analytics.ts');
function cli(args: string[], extraEnv: NodeJS.ProcessEnv = {}, apiFailure = false) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ga4-privacy-'));
  // Legacy output directory exists so the old CLI's unsafe success is observable.
  fs.mkdirSync(path.join(cwd, 'docs/marketing'), { recursive: true });
  try {
    const preloads: string[] = [];
    if (apiFailure) {
      const stub = path.join(cwd, 'stub.mjs');
      const client = pathToFileURL(path.join(root, 'node_modules/@google-analytics/data/build/src/index.js')).href;
      fs.writeFileSync(stub, `import { BetaAnalyticsDataClient } from ${JSON.stringify(client)};\nBetaAnalyticsDataClient.prototype.runReport = async () => { throw new Error('fixture-raw-response-secret'); };`);
      preloads.push('--import', pathToFileURL(stub).href);
      const credentials = path.join(cwd, 'fixture.json');
      fs.writeFileSync(credentials, '{}');
      extraEnv = { ...extraEnv, GOOGLE_APPLICATION_CREDENTIALS: credentials };
    }
    return spawnSync(process.execPath, ['--import', pathToFileURL(path.join(root, 'node_modules/tsx/dist/loader.mjs')).href, ...preloads, script, ...args], {
      cwd, encoding: 'utf8', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...extraEnv },
    });
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
}

test('CLI refuses CI even in mock mode, with only a fixed failure message', () => {
  for (const env of [{ CI: 'true' }, { GITHUB_ACTIONS: 'true' }, { GITHUB_RUN_ID: 'fixture' }]) {
    const result = cli(['--local', '--mock'], env);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.trim(), 'GA4 report failed. See docs/ga4-private-report.md.');
  }
});

test('raw API failures are hidden and never saved as reports', () => {
  const directory = path.join(root, '.private-reports');
  const before = fs.existsSync(directory) ? fs.readdirSync(directory) : [];
  const result = cli(['--local'], { GA4_PROPERTY_ID: 'fixture-property' }, true);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.trim(), 'GA4 report failed. See docs/ga4-private-report.md.');
  assert.deepEqual(fs.readdirSync(directory), before);
});

test('mock CLI saves only a local labeled fixture and prints no report content', () => {
  const directory = path.join(root, '.private-reports');
  const before = new Set(fs.existsSync(directory) ? fs.readdirSync(directory) : []);
  try {
    const result = cli(['--local', '--mock']);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout.trim(), 'GA4 fixture report saved locally (not real data).');
    const created = fs.readdirSync(directory).filter(name => !before.has(name));
    assert.equal(created.length, 1);
    assert.match(created[0], /^mock-/);
    assert.match(fs.readFileSync(path.join(directory, created[0]), 'utf8'), /テストデータ/);
  } finally {
    for (const name of fs.readdirSync(directory)) {
      if (!before.has(name)) fs.unlinkSync(path.join(directory, name));
    }
  }
});

test('CLI requires explicit local opt-in and hides credential errors', () => {
  for (const args of [[], ['--mock'], ['--local']]) {
    const result = cli(args, { GA4_PROPERTY_ID: 'fixture-secret-property', GOOGLE_APPLICATION_CREDENTIALS: 'fixture-secret-key' });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.trim(), 'GA4 report failed. See docs/ga4-private-report.md.');
  }
});

test('weekly workflow has no acquisition, credential, artifact or public report path', () => {
  const workflow = fs.readFileSync('.github/workflows/ga4-weekly-report.yml', 'utf8');
  assert.doesNotMatch(workflow, /secrets\.|ga4-analytics\.ts|upload-artifact|download-artifact|contents: write|ga4-action-strategy|schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
});

test('private output preserves old reports, stays outside public, and uses restrictive Unix permissions', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ga4-output-'));
  try {
    const first = writePrivateReport(directory, 'fixture-only', true);
    const second = writePrivateReport(directory, 'second-fixture', false);
    assert.notEqual(first, second);
    assert.equal(path.dirname(first), path.join(directory, '.private-reports'));
    assert.match(path.basename(first), /^mock-/);
    assert.match(path.basename(second), /^real-/);
    assert.equal(fs.readFileSync(first, 'utf8'), 'fixture-only');
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(first).mode & 0o777, 0o600);
      assert.equal(fs.statSync(path.dirname(first)).mode & 0o777, 0o700);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('private output rejects a symlink or junction to a public directory', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ga4-link-'));
  try {
    const publicDir = path.join(directory, 'public');
    fs.mkdirSync(publicDir);
    fs.symlinkSync(publicDir, path.join(directory, '.private-reports'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => preparePrivateDirectory(directory), /Unsafe/);
    assert.deepEqual(fs.readdirSync(publicDir), []);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('git excludes local reports and the site deployment only uploads public', () => {
  const ignored = spawnSync('git', ['check-ignore', '.private-reports/real-fixture.md'], { encoding: 'utf8' });
  assert.equal(ignored.status, 0);
  const deploy = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
  assert.match(deploy, /path: ['"]?public\/?['"]?/);
});
