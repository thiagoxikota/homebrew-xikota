import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

import { MAX_RESPONSE_BYTES, parseBaseUrl } from '../src/http.mjs';
import { validateInquiry } from '../src/inquiry.mjs';

const exec = promisify(execFile);
const bin = fileURLToPath(new URL('../bin/xikota-design.mjs', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const valid = { name: 'Pessoa de teste', email: 'pessoa@example.com', summary: 'Precisamos revisar os fluxos de um produto de teste.' };
let server;
let base;
let directory;
let fixture;
let requests;
let scenario;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'xikota-cli-test-'));
  fixture = join(directory, 'brief.json');
  await writeFile(fixture, JSON.stringify(valid));
  requests = [];
  scenario = 'ok';
  server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, url: req.url, body, accept: req.headers.accept, authorization: req.headers.authorization, cookie: req.headers.cookie });
    const url = new URL(req.url, base);
    if (scenario === 'timeout') { await new Promise((resolve) => setTimeout(resolve, 300)); }
    if (scenario === '429') { res.writeHead(429, { 'content-type': 'application/problem+json', 'retry-after': '12', ratelimit: '"config";r=0;t=12', 'ratelimit-policy': '"config";q=120;w=60' }); res.end(JSON.stringify({ error: 'rate_limited', message: 'Read quota exceeded.', resolution: 'Wait for Retry-After.' })); return; }
    if (scenario === '500') { res.writeHead(500, { 'content-type': 'text/html' }); res.end('<h1>PRIVATE SERVER STACK MUST NOT BE ECHOED</h1>'); return; }
    if (scenario === 'cross-origin') { res.writeHead(302, { location: 'https://different.example.com/config' }); res.end(); return; }
    if (scenario === 'loop') { res.writeHead(302, { location: '/redirect-loop' }); res.end(); return; }
    if (scenario === 'redirect' && url.pathname === '/api/v1/iniciar') { res.writeHead(302, { location: '/final-config' }); res.end(); return; }
    if (scenario === 'oversized') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(' '.repeat(MAX_RESPONSE_BYTES + 1)); return; }
    if (scenario === 'malformed') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{'); return; }
    if (scenario === 'html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html>Challenge</html>'); return; }
    if (url.pathname === '/docs') { res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' }); res.end('# Xikota Design API\n\nRead the real public configuration.'); return; }
    res.writeHead(200, { 'content-type': 'application/json', 'api-version': '1' });
    if (url.pathname === '/openapi.json') { res.end(JSON.stringify(scenario === 'bad-schema' ? {} : { openapi: '3.1.1', info: { title: 'Xikota Design', version: '1.0.0' }, paths: { '/api/v1/iniciar': { get: {} } } })); return; }
    const locale = url.searchParams.get('locale');
    res.end(JSON.stringify(scenario === 'bad-config' ? { turnstile: {} } : {
      turnstile: scenario === 'no-challenge' ? null : { siteKey: 'PUBLIC_SITE_KEY' },
      ...(locale && { locale, guidance: { challengeRequired: scenario !== 'no-challenge', instructions: 'Review the project brief.', formUrl: 'https://xikota.design/iniciar', contactUrl: 'https://xikota.design/contact' } }),
    }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => { await new Promise((resolve) => server.close(resolve)); });

async function cli(args, { local = false } = {}) {
  try {
    const result = await exec(process.execPath, [bin, ...args, ...(local ? ['--base-url', base] : [])], { maxBuffer: 3 * 1024 * 1024, timeout: 10000 });
    return { ...result, code: 0 };
  } catch (error) {
    if (typeof error.code === 'number') return { stdout: error.stdout, stderr: error.stderr, code: error.code };
    throw error;
  }
}

test('the installed entry point has ordinary help and version commands', async () => {
  const help = await cli(['--help']);
  assert.equal(help.code, 0); assert.equal(help.stderr, '');
  assert.match(help.stdout, /inquiry prepare/); assert.match(help.stdout, /GET requests only/);
  const version = await cli(['--version']);
  assert.equal(version.stdout.trim(), manifest.version);
});

test('discovery is useful JSON and performs no HTTP request', async () => {
  const count = requests.length;
  const result = await cli(['discover', '--json']);
  assert.equal(result.code, 0);
  const discovery = JSON.parse(result.stdout);
  assert.equal(discovery.configuration, 'https://xikota.design/api/v1/iniciar');
  assert.equal(discovery.writesSupportedByCli, false);
  assert.equal(requests.length, count);
});

test('public config sends the actual versioned endpoint and locale', async () => {
  scenario = 'ok';
  const result = await cli(['config', '--locale', 'en'], { local: true });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).locale, 'en');
  assert.equal(requests.at(-1).url, '/api/v1/iniciar?locale=en');
  assert.equal(requests.at(-1).method, 'GET');
  assert.equal(requests.at(-1).authorization, undefined);
  assert.equal(requests.at(-1).cookie, undefined);
});

test('documentation requests Markdown, and OpenAPI/schema preserve the JSON contract', async () => {
  const docs = await cli(['docs'], { local: true });
  assert.match(JSON.parse(docs.stdout).content, /^# Xikota Design API/);
  assert.equal(requests.at(-1).accept, 'text/markdown');
  for (const command of ['openapi', 'schema']) {
    const result = await cli([command], { local: true });
    assert.equal(JSON.parse(result.stdout).openapi, '3.1.1');
  }
});

test('template and local validation never send project details or make HTTP requests', async () => {
  const count = requests.length;
  const template = await cli(['inquiry', 'template']);
  assert.deepEqual(JSON.parse(template.stdout), { name: '', email: '', summary: '' });
  const result = await cli(['inquiry', 'validate', '--file', fixture]);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { valid: true, submitted: false });
  assert.equal(requests.length, count);
  assert.doesNotMatch(result.stdout + result.stderr, /pessoa@example.com/);
});

test('preparation reads configuration only and explicitly leaves submission to a person', async () => {
  scenario = 'ok';
  const start = requests.length;
  const result = await cli(['inquiry', 'prepare', '--file', fixture], { local: true });
  assert.equal(result.code, 0, result.stderr);
  const prepared = JSON.parse(result.stdout);
  assert.equal(prepared.submitted, false);
  assert.equal(prepared.requiresUserAuthorization, true);
  assert.equal(prepared.challengeRequired, true);
  assert.equal(prepared.endpoint, `${base}/api/v1/iniciar`);
  assert.deepEqual(prepared.payload, valid);
  assert.deepEqual(requests.slice(start).map((req) => [req.method, req.url, req.body]), [['GET', '/api/v1/iniciar?locale=pt-BR', '']]);
  assert.ok(!JSON.stringify(requests.slice(start)).includes(valid.email));
  scenario = 'no-challenge';
  const unchallenged = await cli(['inquiry', 'prepare', '--file', fixture, '--locale=en'], { local: true });
  assert.equal(JSON.parse(unchallenged.stdout).challengeRequired, false);
  assert.equal(JSON.parse(unchallenged.stdout).submitted, false);
  scenario = 'ok';
});

test('base URL validation refuses credentials, paths, queries and remote plaintext HTTP without echoing secrets', async () => {
  assert.equal(parseBaseUrl('https://xikota.design'), 'https://xikota.design');
  assert.equal(parseBaseUrl('http://[::1]:8788'), 'http://[::1]:8788');
  for (const value of ['http://example.com', 'file:///etc/passwd', 'https://user:TOP_SECRET@example.com', 'https://example.com/path', 'https://example.com/?token=TOP_SECRET', 'https://example.com/#secret']) {
    const result = await cli(['config', '--base-url', value]);
    assert.equal(result.code, 2);
    assert.equal(JSON.parse(result.stderr).error.code, 'usage_error');
    assert.equal(result.stdout, '');
    assert.doesNotMatch(result.stderr, /TOP_SECRET/);
  }
});

test('usage errors include stable codes and exit status', async () => {
  for (const args of [['submit'], ['config', '--locale', 'fr'], ['config', '--timeout', '1'], ['config', '--timeout', 'NaN'], ['inquiry', 'validate'], ['config', '--file', 'ignored.json'], ['config', '--unknown=TOP_SECRET']]) {
    const result = await cli(args);
    assert.equal(result.code, 2);
    assert.equal(JSON.parse(result.stderr).error.code, 'usage_error');
    assert.doesNotMatch(result.stderr, /TOP_SECRET/);
  }
});

test('inquiry validation follows server rules, prevents truncation and never prints rejected data', async () => {
  for (const [patch, field] of [[{ name: 'a' }, 'name'], [{ email: 'not-email' }, 'email'], [{ summary: 'short' }, 'summary'], [{ summary: 'x'.repeat(4001) }, 'summary'], [{ whatsapp: 'abc' }, 'whatsapp'], [{ service: 'invented' }, 'service'], [{ deadline: 'x'.repeat(121) }, 'deadline'], [{ investment: 'x'.repeat(121) }, 'investment'], [{ link: 'x'.repeat(301) }, 'link'], [{ website: 'bot' }, 'website'], [{ utm: { unexpected: 'value' } }, 'utm'], [{ utm: { utm_source: 12 } }, 'utm'], [{ turnstileToken: 'TOP_SECRET_CHALLENGE' }, 'turnstileToken'], [{ arbitrary: 'TOP_SECRET' }, 'input']]) {
    const path = join(directory, 'invalid.json');
    await writeFile(path, JSON.stringify({ ...valid, ...patch }));
    const result = await cli(['inquiry', 'validate', '--file', path]);
    assert.equal(result.code, 3, JSON.stringify(patch));
    assert.ok(JSON.parse(result.stderr).error.fields[field]);
    assert.equal(result.stdout, '');
    assert.doesNotMatch(result.stderr, /TOP_SECRET|pessoa@example.com/);
  }
  const normalized = validateInquiry({ ...valid, name: ` ${valid.name} `, whatsapp: '(48) 99999-1234', company: '', utm: { utm_source: 'test' }, website: '' });
  assert.equal(normalized.name, valid.name);
  assert.equal(normalized.company, undefined);
  assert.equal(normalized.website, undefined);
});

test('unreadable, nonobject, malformed and oversized local input has typed redacted errors', async () => {
  const missing = await cli(['inquiry', 'validate', '--file', join(directory, 'not-there.json')]);
  assert.equal(missing.code, 3); assert.equal(JSON.parse(missing.stderr).error.code, 'input_unreadable');
  for (const [contents, expected] of [['{', 'invalid_input_json'], ['[]', 'input_validation'], ['x'.repeat(128 * 1024 + 1), 'input_too_large']]) {
    const path = join(directory, 'bad.json'); await writeFile(path, contents);
    const result = await cli(['inquiry', 'validate', '--file', path]);
    assert.equal(result.code, 3); assert.equal(JSON.parse(result.stderr).error.code, expected);
  }
});

test('HTTP errors expose rate-limit recovery and do not leak raw HTML errors', async () => {
  scenario = '429';
  const limited = await cli(['config'], { local: true });
  const error = JSON.parse(limited.stderr).error;
  assert.equal(limited.code, 4); assert.equal(error.code, 'rate_limited');
  assert.equal(error.retryAfter, '12'); assert.match(error.rateLimitPolicy, /q=120/);
  scenario = '500';
  const failed = await cli(['config'], { local: true });
  assert.equal(failed.code, 4); assert.equal(JSON.parse(failed.stderr).error.status, 500);
  assert.doesNotMatch(failed.stderr, /PRIVATE SERVER STACK/);
  scenario = 'ok';
});

test('timeout, redirect loops and cross-origin redirects are bounded typed failures', async () => {
  scenario = 'timeout';
  const timeout = await cli(['config', '--timeout', '100'], { local: true });
  assert.equal(JSON.parse(timeout.stderr).error.code, 'request_timeout');
  scenario = 'loop';
  const loop = await cli(['config'], { local: true });
  assert.equal(JSON.parse(loop.stderr).error.code, 'redirect_limit');
  scenario = 'cross-origin';
  const unsafe = await cli(['config'], { local: true });
  assert.equal(JSON.parse(unsafe.stderr).error.code, 'unsafe_redirect');
  scenario = 'redirect';
  const followed = await cli(['config'], { local: true });
  assert.equal(followed.code, 0, followed.stderr);
  assert.equal(requests.at(-1).url, '/final-config');
  scenario = 'ok';
});

test('malformed, HTML, oversized and incompatible public responses fail clearly', async () => {
  for (const [mode, command, expected] of [['malformed', 'config', 'invalid_json_response'], ['html', 'config', 'unexpected_content_type'], ['oversized', 'config', 'response_too_large'], ['bad-config', 'config', 'invalid_configuration'], ['bad-schema', 'openapi', 'invalid_openapi']]) {
    scenario = mode;
    const result = await cli([command], { local: true });
    assert.equal(result.code, 5); assert.equal(JSON.parse(result.stderr).error.code, expected);
  }
  scenario = 'ok';
});

test('all network interactions made by the suite were public GETs without an inquiry body or credentials', () => {
  assert.ok(requests.length > 0);
  for (const request of requests) {
    assert.equal(request.method, 'GET');
    assert.equal(request.body, '');
    assert.equal(request.authorization, undefined);
    assert.equal(request.cookie, undefined);
  }
});
