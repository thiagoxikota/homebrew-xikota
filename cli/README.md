# Xikota Design CLI

Official command-line client for the Xikota Design public API. It reads the
documentation, OpenAPI description and live inquiry configuration, and prepares
a project brief for a person to review. Node.js 20.9 or newer is required.
There are no runtime dependencies or install hooks.

## Install

Homebrew:

```sh
brew tap thiagoxikota/xikota
brew install thiagoxikota/xikota/xikota-design
xikota-design --help
```

Without installing globally, use the versioned package hosted by Xikota Design:

```sh
npx --yes --package=https://xikota.design/cli/xikota-design-cli-0.1.0.tgz xikota-design --help
```

The package is distributed through the official Homebrew tap and the versioned
download above. It is not currently published to the npm registry. To install
the downloaded package with npm instead:

```sh
npm install --global https://xikota.design/cli/xikota-design-cli-0.1.0.tgz
```

Source: [thiagoxikota/homebrew-xikota, cli directory](https://github.com/thiagoxikota/homebrew-xikota/tree/main/cli).
The package includes its ISC license.

## Commands

```sh
xikota-design --version
xikota-design discover
xikota-design docs
xikota-design openapi > openapi.json
xikota-design schema
xikota-design config
xikota-design config --locale en
```

`discover` prints the official entry points without making a network request.
`docs` requests the documentation with `Accept: text/markdown` and returns its
URL, content type and text in JSON. `openapi` and its `schema` alias print the
OpenAPI JSON unchanged. `config` reads `GET /api/v1/iniciar`; `--locale pt-BR`
or `--locale en` requests the API's localized guidance.

Commands write JSON to stdout. `--json` explicitly selects the same default.
`--help` and `--version` produce plain text. Errors are a JSON object on stderr,
and stdout stays empty on failure.

## Prepare a project inquiry

```sh
xikota-design inquiry template > brief.json
# Fill name, email and summary in brief.json, then:
xikota-design inquiry validate --file brief.json
xikota-design inquiry prepare --file brief.json
```

`template` and `validate` work entirely offline. `prepare` validates the local
brief, then reads the live public configuration. The brief and personal data
are never sent over the network by the CLI. The result includes the validated
payload, target API URL, active challenge state, browser handoff URL and
`submitted: false`. It does not create a contact, opportunity, subscription,
quote, payment or message.

Required fields are `name` (at least two characters), a valid `email` and
`summary` (at least ten characters). Optional fields follow the published
ProjectInquiry schema: `whatsapp`, `company`, `service`, `deadline`,
`investment`, `link` and `utm`. Supported service values are `marca`,
`design-grafico`, `tirar-do-papel`, `evoluir`, `site-app` and `outro`.

The CLI refuses data that the server would truncate: summary over 4,000
characters, deadline/investment over 120, reference link over 300, or campaign
attribution values over 120. It also rejects unknown fields and an occupied
honeypot. These local checks help a person review the complete intended brief;
server validation remains authoritative.

The CLI has no submit command. A person must review the details and authorize
the actual inquiry in the [project form](https://xikota.design/iniciar).
Complete Turnstile in the browser when it is active. The CLI rejects saved
`turnstileToken` fields and does not accept administrator tokens, cookies or
API credentials. Preparation never implies a price, deadline, accepted scope
or permission to send.

## Configuration and transport

The default origin is `https://xikota.design`. No account or API key is needed
for these public read operations. To use a controlled preview or local server:

```sh
xikota-design config --base-url https://preview.example.com
xikota-design config --base-url http://127.0.0.1:8788 --timeout 5000
```

`--base-url` accepts an HTTPS origin without credentials, a path, query or
fragment. Plain HTTP is limited to localhost, 127.0.0.1 and IPv6 loopback for
local testing. Redirects must remain on the selected origin, and the CLI stops
after three redirects. Reads time out after 10 seconds by default; `--timeout`
accepts 100 to 60,000 milliseconds. Responses are limited to 2 MiB and local
briefs to 128 KiB. No persistent configuration or credential file is created.

The API's GET quota is separate from inquiry submission quotas. The CLI never
automatically retries. HTTP 429 errors include the public `Retry-After`,
`RateLimit` and `RateLimit-Policy` values when the service provides them.
Honor those instructions before retrying.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Command completed; preparation still has `submitted: false`. |
| 1 | Unexpected internal failure; private input is omitted from the error. |
| 2 | Invalid command, option, URL or unsupported runtime. |
| 3 | Unreadable, invalid or incomplete local inquiry input. |
| 4 | Network, timeout, HTTP, rate-limit or redirect failure. |
| 5 | Invalid response type, public contract or response size. |

For example, an invalid brief returns this shape on stderr:

```json
{"error":{"code":"input_validation","message":"The inquiry needs correction before it can be prepared.","resolution":"Correct the indicated fields. Do not store challenge tokens or sensitive personal data in the brief; complete verification in the browser.","fields":{"email":"invalid_email"}}}
```

## Development and packaging

From `cli/` in the public source checkout:

```sh
npm test
mkdir -p dist
npm run pack:release
node bin/xikota-design.mjs --help
```

Tests exercise real CLI subprocesses against a local HTTP server, validate
request privacy and errors. They do not submit real inquiries or contact anyone.
To check compatibility with a separately downloaded public OpenAPI description,
run `npm run test:contract -- /path/to/openapi.json`. This check reads a local
schema file and prints no inquiry or private source data.
The package allowlist contains only the executable, its source and this README;
the license is included automatically. Tests, fixtures and build archives are
excluded from published packages.

API documentation: [xikota.design/docs](https://xikota.design/docs).
OpenAPI: [xikota.design/openapi.json](https://xikota.design/openapi.json).
