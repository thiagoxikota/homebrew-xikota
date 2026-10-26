import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { SERVICES } from '../src/inquiry.mjs';

if (process.argv.length !== 3) {
  process.stderr.write('Usage: npm run test:contract -- /path/to/public-openapi.json\n');
  process.exitCode = 2;
} else {
  const schema = JSON.parse(await readFile(process.argv[2], 'utf8'));
  assert.ok(schema.paths['/api/v1/iniciar']?.get, 'The versioned configuration read must be published.');
  assert.ok(schema.paths['/api/v1/iniciar']?.post, 'The real inquiry operation must be documented.');
  const inquiry = schema.components.schemas.ProjectInquiry;
  assert.deepEqual(inquiry.required, ['name', 'email', 'summary']);
  assert.equal(inquiry.properties.name.minLength, 2);
  assert.equal(inquiry.properties.summary.minLength, 10);
  assert.equal(inquiry.properties.email.format, 'email');
  assert.deepEqual(inquiry.properties.service.enum, SERVICES);
  for (const key of ['whatsapp', 'company', 'deadline', 'investment', 'link', 'utm', 'turnstileToken']) assert.ok(inquiry.properties[key], key);
  process.stdout.write('Public OpenAPI v1 contract matches the CLI.\n');
}
