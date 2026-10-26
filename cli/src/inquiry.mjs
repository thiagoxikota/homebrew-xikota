import { readFile, stat } from 'node:fs/promises';

import { CliError } from './errors.mjs';

export const SERVICES = ['marca', 'design-grafico', 'tirar-do-papel', 'evoluir', 'site-app', 'outro'];
const KEYS = new Set(['name', 'email', 'summary', 'whatsapp', 'company', 'service', 'deadline', 'investment', 'link', 'website', 'utm']);
const UTM_KEYS = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']);
export const MAX_INPUT_BYTES = 128 * 1024;

export async function readInquiry(path) {
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new CliError('invalid_input_file', 'The inquiry input must be a regular JSON file.', 'Pass a local UTF-8 JSON file with --file.', 3);
    if (info.size > MAX_INPUT_BYTES) throw new CliError('input_too_large', 'The inquiry JSON exceeds 128 KiB.', 'Keep a concise project summary and reference larger material with a link.', 3);
    const text = await readFile(path, 'utf8');
    if (Buffer.byteLength(text, 'utf8') > MAX_INPUT_BYTES) throw new CliError('input_too_large', 'The inquiry JSON exceeds 128 KiB.', 'Reduce the input file size before preparing the inquiry.', 3);
    try { return JSON.parse(text); } catch {
      throw new CliError('invalid_input_json', 'The inquiry file is not valid JSON.', 'Start with xikota-design inquiry template and fill its three required fields.', 3);
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('input_unreadable', 'The inquiry input could not be read.', 'Check the file path and read permissions; input data is never included in this error.', 3);
  }
}

// Match the public v1 request contract. Refuse silent server-side truncation
// and retain the same email/phone validity rules as server/normalize.ts.
export function validateInquiry(input) {
  const fields = Object.create(null);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CliError('input_validation', 'The inquiry must be a JSON object.', 'Use the object produced by xikota-design inquiry template.', 3, { fields: { input: 'expected_object' } });
  }
  if (Object.hasOwn(input, 'turnstileToken')) fields.turnstileToken = 'browser_verification_required';
  if (Object.keys(input).some((key) => !KEYS.has(key) && key !== 'turnstileToken')) fields.input = 'unsupported_fields';
  const payload = {};
  for (const key of KEYS) {
    if (!Object.hasOwn(input, key) || key === 'utm') continue;
    if (typeof input[key] !== 'string') { fields[key] = 'expected_string'; continue; }
    const value = input[key].trim();
    if (value || ['name', 'email', 'summary'].includes(key)) payload[key] = value;
  }
  if (!payload.name || payload.name.length < 2) fields.name = 'invalid_name';
  if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) fields.email = 'invalid_email';
  if (!payload.summary || payload.summary.length < 10) fields.summary = 'invalid_summary';
  if (payload.summary?.length > 4000) fields.summary = 'would_be_truncated';
  if (payload.whatsapp) {
    let digits = payload.whatsapp.replace(/\D/g, '').replace(/^0+/, '');
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
    if (digits.length < 8 || digits.length > 15) fields.whatsapp = 'invalid_whatsapp';
  }
  if (payload.service && !SERVICES.includes(payload.service)) fields.service = 'unsupported_service';
  for (const [key, max] of [['deadline', 120], ['investment', 120], ['link', 300]]) {
    if (payload[key]?.length > max) fields[key] = 'would_be_truncated';
  }
  if (payload.website) fields.website = 'honeypot_must_be_empty';
  delete payload.website;
  if (Object.hasOwn(input, 'utm')) {
    if (!input.utm || typeof input.utm !== 'object' || Array.isArray(input.utm)) fields.utm = 'expected_object';
    else {
      const utm = {};
      if (Object.keys(input.utm).some((key) => !UTM_KEYS.has(key))) fields.utm = 'unsupported_attribution_fields';
      for (const key of UTM_KEYS) {
        if (!Object.hasOwn(input.utm, key)) continue;
        if (typeof input.utm[key] !== 'string') fields.utm = 'expected_string_values';
        else if (input.utm[key].length > 120) fields.utm = 'would_be_truncated';
        else if (input.utm[key]) utm[key] = input.utm[key];
      }
      if (Object.keys(utm).length) payload.utm = utm;
    }
  }
  if (Object.keys(fields).length) throw new CliError('input_validation', 'The inquiry needs correction before it can be prepared.', 'Correct the indicated fields. Do not store challenge tokens or sensitive personal data in the brief; complete verification in the browser.', 3, { fields });
  return payload;
}
