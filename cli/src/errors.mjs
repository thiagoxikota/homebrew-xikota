export class CliError extends Error {
  constructor(code, message, resolution, exitCode = 2, details = {}) {
    super(message);
    this.code = code;
    this.resolution = resolution;
    this.exitCode = exitCode;
    this.details = details;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, resolution: this.resolution, ...this.details } };
  }
}

export function usage(message) {
  return new CliError('usage_error', message, 'Run xikota-design --help for supported commands and options.');
}
