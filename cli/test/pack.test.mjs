import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));

test('the real npm package contains only the new public runtime and works outside the checkout', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xikota-cli-pack-'));
  const { stdout } = await exec('npm', ['pack', '--ignore-scripts', '--pack-destination', directory, '--json'], { cwd: root });
  const packed = JSON.parse(stdout)[0];
  const paths = packed.files.map((file) => file.path);
  assert.ok(paths.includes('LICENSE'));
  assert.ok(paths.includes('README.md'));
  assert.ok(paths.includes('bin/xikota-design.mjs'));
  assert.ok(paths.includes('src/cli.mjs'));
  assert.ok(paths.every((path) => path === 'package.json' || path === 'README.md' || path === 'LICENSE' || path.startsWith('src/') || path.startsWith('bin/')));
  assert.equal(packed.files.find((file) => file.path === 'bin/xikota-design.mjs').mode & 0o111, 0o111);
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.repository.url, 'git+https://github.com/thiagoxikota/homebrew-xikota.git');
  assert.equal(manifest.license, 'ISC');
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.scripts.postinstall, undefined);
  const result = await exec('npm', ['exec', '--offline', '--yes', '--cache', join(directory, 'cache'), `--package=${join(directory, packed.filename)}`, '--', 'xikota-design', '--version'], { cwd: directory, timeout: 20000 });
  assert.equal(result.stdout.trim(), manifest.version);
  const discovery = await exec('npm', ['exec', '--offline', '--yes', '--cache', join(directory, 'cache'), `--package=${join(directory, packed.filename)}`, '--', 'xikota-design', 'discover'], { cwd: directory, timeout: 20000 });
  assert.equal(JSON.parse(discovery.stdout).writesSupportedByCli, false);
});
