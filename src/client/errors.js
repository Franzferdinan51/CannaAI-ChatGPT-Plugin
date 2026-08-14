const STATUS_MAP = new Map([
  [400, "CANNAAI_VALIDATION_ERROR"],
  [401, "CANNAAI_UNAUTHORIZED"],
  [403, "CANNAAI_FORBIDDEN"],
  [404, "CANNAAI_NOT_FOUND"],
  [409, "CANNAAI_CONFLICT"],
  [429, "CANNAAI_RATE_LIMITED"],
]);

export class CannaAIError extends Error {
  constructor(code, message, { status = null, retryable = false, cause = undefined } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "CannaAIError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function errorFromStatus(status) {
  const code = STATUS_MAP.get(status) ?? (status >= 500 ? "CANNAAI_INTERNAL_ERROR" : "CANNAAI_INTERNAL_ERROR");
  const retryable = status === 429 || status >= 500;
  return new CannaAIError(code, `CannaAI returned HTTP ${status}.`, { status, retryable });
}

export function timeoutError(cause) {
  return new CannaAIError("CANNAAI_TIMEOUT", "CannaAI did not respond before the request timeout.", {
    retryable: true,
    cause,
  });
}

export function unavailableError(cause) {
  return new CannaAIError("CANNAAI_UNAVAILABLE", "CannaAI could not be reached.", {
    retryable: true,
    cause,
  });
}
