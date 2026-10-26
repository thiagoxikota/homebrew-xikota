# Xikota Design CLI and Homebrew tap

Official Homebrew distribution and public source of the Xikota Design CLI.
The client reads public API resources and prepares a project brief locally.

```sh
brew tap thiagoxikota/xikota
brew install thiagoxikota/xikota/xikota-design
xikota-design --help
xikota-design config --locale en
```

See [CLI documentation](cli/README.md), [API documentation](https://xikota.design/docs)
and the [OpenAPI contract](https://xikota.design/openapi.json).

The CLI requires Node.js 20.9 or newer. It has no runtime dependencies or install hooks.
It does not submit inquiries or store credentials. Runtime source and the tap use the ISC license.

Run `cd cli && npm test` to verify the public source. The versioned archive is
linked from the formula with its SHA-256 checksum.
