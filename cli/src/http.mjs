import { CliError, usage } from './errors.mjs';

export const DEFAULT_BASE_URL = 'https://xikota.design';
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export function parseBaseUrl(value = DEFAULT_BASE_URL) {
  let url;
  try { url = new URL(value); } catch { throw usage('The base URL must be an absolute HTTPS URL.'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw usage('The base URL must identify an origin, without credentials, a path, query or fragment.');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw usage('Use HTTPS. HTTP is supported only for a local loopback test server.');
  }
  return url.origin;
}

async function boundedText(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let length = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new CliError('response_too_large', 'The public response exceeds the CLI size limit.', 'Use the published documentation URL directly or report the oversized response.', 5);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

export async function getPublic(baseUrl, path, { accept = 'application/json', timeout = 10000, version = '0.1.2' } = {}) {
  let url = new URL(path, baseUrl);
  const signal = AbortSignal.timeout(timeout);
  try {
    for (let hop = 0; hop <= 3; hop++) {
      const response = await fetch(url, {
        method: 'GET',
        headers: { accept, 'user-agent': `xikota-design-cli/${version} (+https://xikota.design/docs#cli)` },
        redirect: 'manual',
        signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location || hop === 3) throw new CliError('redirect_limit', 'The public endpoint did not resolve within three redirects.', 'Use its final canonical URL or report the redirect loop.', 4);
        const next = new URL(location, url);
        if (next.origin !== baseUrl || next.username || next.password) {
          throw new CliError('unsafe_redirect', 'The endpoint redirected outside the selected origin.', 'Verify the canonical service origin and pass it explicitly with --base-url.', 4);
        }
        url = next;
        continue;
      }
      const text = await boundedText(response);
      const contentType = response.headers.get('content-type') ?? '';
      if (!response.ok) {
        let problem;
        if (/^application\/(?:[\w.+-]+\+)?json(?:;|$)/i.test(contentType)) {
          try { problem = JSON.parse(text); } catch { /* Fall back to a safe status explanation. */ }
        }
        const publicMessage = typeof problem?.message === 'string' ? problem.message : typeof problem?.detail === 'string' ? problem.detail : `The public endpoint returned HTTP ${response.status}.`;
        const resolution = typeof problem?.resolution === 'string' ? problem.resolution : response.status === 429 ? 'Honor Retry-After before retrying this read-only request.' : 'Check the service status and the public API documentation; no inquiry was submitted.';
        throw new CliError(response.status === 429 ? 'rate_limited' : 'http_error', publicMessage.slice(0, 500), resolution.slice(0, 500), 4, {
          status: response.status,
          ...(response.headers.has('retry-after') && { retryAfter: response.headers.get('retry-after') }),
          ...(response.headers.has('ratelimit') && { rateLimit: response.headers.get('ratelimit') }),
          ...(response.headers.has('ratelimit-policy') && { rateLimitPolicy: response.headers.get('ratelimit-policy') }),
        });
      }
      return { text, contentType, url: url.href, headers: response.headers };
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    if (signal.aborted) throw new CliError('request_timeout', 'The public request exceeded its time limit.', 'Retry later or choose a larger --timeout value, up to 60000 milliseconds.', 4);
    throw new CliError('network_error', 'The public service could not be reached.', 'Check the connection and --base-url. The CLI sends no inquiry or credentials.', 4);
  }
}

export async function getJson(baseUrl, path, options) {
  const response = await getPublic(baseUrl, path, options);
  if (!/^application\/(?:[\w.+-]+\+)?json(?:;|$)/i.test(response.contentType)) {
    throw new CliError('unexpected_content_type', 'The public endpoint did not return JSON.', 'Open the documentation URL in a browser and check for a service or security challenge.', 5);
  }
  let data;
  try { data = JSON.parse(response.text); } catch {
    throw new CliError('invalid_json_response', 'The public endpoint returned malformed JSON.', 'Report the response problem to Xikota Design; no inquiry was submitted.', 5);
  }
  return { ...response, data };
}
