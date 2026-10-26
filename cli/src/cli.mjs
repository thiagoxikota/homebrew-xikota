import { readFile } from 'node:fs/promises';

import { CliError, usage } from './errors.mjs';
import { DEFAULT_BASE_URL, getJson, getPublic, parseBaseUrl } from './http.mjs';
import { readInquiry, validateInquiry } from './inquiry.mjs';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const HELP = `Xikota Design CLI ${manifest.version}

Read public documentation and prepare a project inquiry for human review.
Node.js 20.9+ is required. Commands return JSON; help/version are plain text.

Usage: xikota-design <command> [options]

Commands:
  discover                      Show the official public entry points
  docs                          Read the API documentation as Markdown in JSON
  openapi | schema              Read the machine-readable OpenAPI description
  config                        Read live public inquiry configuration
  inquiry template              Print a JSON brief template, without network access
  inquiry validate --file PATH   Validate a brief locally, without network access
  inquiry prepare --file PATH    Validate locally and read live configuration

Options:
  --base-url URL                 Service origin (default: ${DEFAULT_BASE_URL})
  --locale pt-BR|en              Actual localized configuration guidance
  --timeout MS                  Read timeout, 100-60000 (default: 10000)
  --json                        Explicit JSON mode (the default for commands)
  --help, -h                    Show this help
  --version, -v                 Show the CLI version

Examples:
  xikota-design config --locale en
  xikota-design openapi > openapi.json
  xikota-design inquiry template > brief.json
  xikota-design inquiry validate --file brief.json
  xikota-design inquiry prepare --file brief.json

The CLI performs GET requests only. It never submits an inquiry, sends a message,
solves Turnstile or handles an administrator token. Review and send in the browser.
`;

function parseArgs(args) {
  const options = { baseUrl: DEFAULT_BASE_URL, timeout: 10000 };
  const positional = [];
  const valued = new Map([['--base-url', 'baseUrl'], ['--timeout', 'timeout'], ['--locale', 'locale'], ['--file', 'file']]);
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (['--help', '-h'].includes(argument)) options.help = true;
    else if (['--version', '-v'].includes(argument)) options.version = true;
    else if (argument === '--json') options.json = true;
    else if (argument.startsWith('-')) {
      const [flag, ...inline] = argument.split('=');
      if (!valued.has(flag)) throw usage('An unsupported option was supplied.');
      const value = inline.length ? inline.join('=') : args[++index];
      if (!value || value.startsWith('--')) throw usage('An option is missing its value.');
      options[valued.get(flag)] = value;
    } else positional.push(argument);
  }
  options.baseUrl = parseBaseUrl(options.baseUrl);
  options.timeout = Number(options.timeout);
  if (!Number.isInteger(options.timeout) || options.timeout < 100 || options.timeout > 60000) throw usage('--timeout must be an integer between 100 and 60000 milliseconds.');
  if (options.locale && !['pt-BR', 'en'].includes(options.locale)) throw usage('--locale must be pt-BR or en.');
  return { options, positional };
}

function configurationPath(locale) {
  return `/api/v1/iniciar${locale ? `?locale=${encodeURIComponent(locale)}` : ''}`;
}

async function configuration(options) {
  const { data } = await getJson(options.baseUrl, configurationPath(options.locale), { ...options, version: manifest.version });
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.hasOwn(data, 'turnstile')
    || (data.turnstile !== null && (!data.turnstile || typeof data.turnstile.siteKey !== 'string' || !data.turnstile.siteKey))) {
    throw new CliError('invalid_configuration', 'The public configuration does not match API v1.', 'Read the current OpenAPI description and report the incompatible configuration.', 5);
  }
  return data;
}

export async function execute(args) {
  const { options, positional } = parseArgs(args);
  if (options.help || !positional.length && !options.version) return { text: HELP };
  if (options.version) return { text: manifest.version + '\n' };
  const [command, action, ...extra] = positional;
  if (extra.length || command !== 'inquiry' && action) throw usage('The command received unexpected positional arguments.');
  if (options.file && !(command === 'inquiry' && ['validate', 'prepare'].includes(action))) throw usage('--file is supported only for inquiry validate and inquiry prepare.');
  const url = (path) => new URL(path, options.baseUrl).href;
  if (command === 'discover') return { data: {
    name: 'Xikota Design', cliVersion: manifest.version, apiVersion: '1',
    documentation: url('/docs'), openapi: url('/openapi.json'),
    configuration: url(configurationPath(options.locale)), projectForm: url('/iniciar'),
    contact: url('/contact'), agentInstructions: url('/llms.txt'),
    writesSupportedByCli: false,
  } };
  if (command === 'docs') {
    const response = await getPublic(options.baseUrl, '/docs', { ...options, version: manifest.version, accept: 'text/markdown' });
    if (!/^text\/markdown(?:;|$)/i.test(response.contentType)) throw new CliError('unexpected_content_type', 'The documentation did not return Markdown.', 'Open the documentation in a browser and check the service response.', 5);
    if (!response.text.trim()) throw new CliError('empty_documentation', 'The documentation response is empty.', 'Read the public documentation URL in a browser and report the empty response.', 5);
    return { data: { url: response.url, contentType: response.contentType, content: response.text } };
  }
  if (['openapi', 'schema'].includes(command)) {
    const { data } = await getJson(options.baseUrl, '/openapi.json', { ...options, version: manifest.version });
    if (!data || typeof data.openapi !== 'string' || !data.openapi.startsWith('3.')
      || !data.info || typeof data.info.title !== 'string' || typeof data.info.version !== 'string'
      || !data.paths || typeof data.paths !== 'object' || Array.isArray(data.paths)) throw new CliError('invalid_openapi', 'The published response is not an OpenAPI 3 description.', 'Read the documentation and report the invalid public schema.', 5);
    return { data };
  }
  if (command === 'config') return { data: await configuration(options) };
  if (command !== 'inquiry' || !['template', 'validate', 'prepare'].includes(action)) throw usage('Select a supported command or inquiry action.');
  if (action === 'template') return { data: { name: '', email: '', summary: '' } };
  if (!options.file) throw usage('A local JSON brief must be supplied with --file.');
  const payload = validateInquiry(await readInquiry(options.file));
  if (action === 'validate') return { data: { valid: true, submitted: false } };
  const config = await configuration({ ...options, locale: options.locale ?? 'pt-BR' });
  return { data: {
    valid: true, submitted: false, method: 'POST', endpoint: url('/api/v1/iniciar'),
    requiresUserAuthorization: true, challengeRequired: config.turnstile !== null,
    browserHandoff: url('/iniciar'), payload,
    nextSteps: [
      'Ask the person to review the project context and contact details.',
      'Open the project form, complete any active Turnstile challenge and obtain authorization before sending.',
      'Do not infer acceptance, a price, scope or a delivery date from this preparation.',
    ],
  } };
}

export async function main(args) {
  try {
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major < 20 || major === 20 && minor < 9) throw new CliError('unsupported_runtime', 'Node.js 20.9 or newer is required.', 'Install a supported Node.js release and run the CLI again.');
    const result = await execute(args);
    process.stdout.write(result.text ?? JSON.stringify(result.data, null, 2) + '\n');
  } catch (error) {
    const safe = error instanceof CliError ? error : new CliError('internal_error', 'The CLI could not complete the command.', 'Check the command and report the issue without including private input data.', 1);
    process.stderr.write(JSON.stringify(safe.toJSON()) + '\n');
    process.exitCode = safe.exitCode;
  }
}
