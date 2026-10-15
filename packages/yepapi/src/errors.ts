/** Codes documented by YepAPI. */
export type YepApiServerErrorCode =
  | 'INVALID_API_KEY'
  | 'REVOKED_API_KEY'
  | 'NO_CREDITS'
  | 'ACCOUNT_FROZEN'
  | 'VALIDATION_ERROR'
  | 'INVALID_PARAMS'
  | 'NOT_FOUND'
  | 'JOB_NOT_FOUND'
  | 'JOB_EXPIRED'
  | 'MEDIA_MODEL_NOT_FOUND'
  | 'UPSTREAM_ERROR'
  | 'AI_UPSTREAM_ERROR'
  | 'INTERNAL_ERROR';

/** Codes produced by this client when there is no usable server response. */
export type YepApiClientErrorCode = 'NETWORK_ERROR' | 'TIMEOUT' | 'ABORTED' | 'INVALID_RESPONSE';

export type YepApiErrorCode = YepApiServerErrorCode | YepApiClientErrorCode | (string & {});

export type YepApiErrorKind =
  | 'invalid_key'
  | 'account_frozen'
  | 'insufficient_balance'
  | 'validation'
  | 'rate_limited'
  | 'not_found'
  | 'server'
  | 'timeout'
  | 'network'
  | 'aborted'
  | 'invalid_response'
  | 'unknown';

export interface YepApiErrorInit {
  /** HTTP status; 0 when no response was received. */
  status: number;
  code: YepApiErrorCode;
  endpoint: string;
  requestId?: string;
  upstream?: { status?: number; message?: string };
  retryAfterMs?: number;
  attempts?: number;
  /** False when the connection failed before the request could reach YepAPI. */
  requestSent?: boolean;
  cause?: unknown;
}

export class YepApiError extends Error {
  readonly status: number;
  readonly code: YepApiErrorCode;
  readonly endpoint: string;
  /** `request_id` / `x-request-id`, for support and the dashboard's API logs. */
  readonly requestId?: string;
  /** Extra context sent with `UPSTREAM_ERROR`. */
  readonly upstream?: { status?: number; message?: string };
  readonly retryAfterMs?: number;
  /**
   * False when the connection failed before the request could reach YepAPI (refused, DNS,
   * unreachable), so nothing can have been billed. Undefined when that cannot be known.
   */
  readonly requestSent?: boolean;
  /** Number of HTTP attempts made, retries included. */
  attempts: number;

  constructor(message: string, init: YepApiErrorInit) {
    super(message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = 'YepApiError';
    this.status = init.status;
    this.code = init.code;
    this.endpoint = init.endpoint;
    this.requestId = init.requestId;
    this.upstream = init.upstream;
    this.retryAfterMs = init.retryAfterMs;
    this.requestSent = init.requestSent;
    this.attempts = init.attempts ?? 1;
  }

  /** 401: missing, invalid or revoked key. */
  get isInvalidKey(): boolean {
    return (
      this.status === 401 || this.code === 'INVALID_API_KEY' || this.code === 'REVOKED_API_KEY'
    );
  }

  /** 403: account frozen pending a billing review. */
  get isAccountFrozen(): boolean {
    return this.status === 403 || this.code === 'ACCOUNT_FROZEN';
  }

  /** 401 or 403: the key cannot be used as it stands. */
  get isAuthError(): boolean {
    return this.isInvalidKey || this.isAccountFrozen;
  }

  /** 402 `NO_CREDITS`. */
  get isInsufficientBalance(): boolean {
    return this.status === 402 || this.code === 'NO_CREDITS';
  }

  /** 400: rejected request body or unsupported option. Never retried, never billed. */
  get isValidation(): boolean {
    return (
      this.status === 400 || this.code === 'VALIDATION_ERROR' || this.code === 'INVALID_PARAMS'
    );
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }

  get isTimeout(): boolean {
    return this.code === 'TIMEOUT';
  }

  get isNetworkError(): boolean {
    return this.code === 'NETWORK_ERROR';
  }

  get isAborted(): boolean {
    return this.code === 'ABORTED';
  }

  /** True for the conditions the client retries on free calls: 429, 5xx and network failures. */
  get isRetryable(): boolean {
    return this.isRateLimited || this.isServerError || this.isNetworkError;
  }

  /**
   * True when retrying a paid call cannot bill twice: a 429 (refused before any work) or a
   * connection that failed before the request was sent. A 5xx or a connection lost mid-call
   * may have been billed already, so paid calls are not retried on those.
   */
  get isRetryableWhenBilled(): boolean {
    return this.isRateLimited || (this.isNetworkError && this.requestSent === false);
  }

  get kind(): YepApiErrorKind {
    if (this.isAborted) return 'aborted';
    if (this.isTimeout) return 'timeout';
    if (this.isNetworkError) return 'network';
    if (this.code === 'INVALID_RESPONSE') return 'invalid_response';
    if (this.isInvalidKey) return 'invalid_key';
    if (this.isAccountFrozen) return 'account_frozen';
    if (this.isInsufficientBalance) return 'insufficient_balance';
    if (this.isValidation) return 'validation';
    if (this.isRateLimited) return 'rate_limited';
    if (this.isNotFound) return 'not_found';
    if (this.isServerError) return 'server';
    return 'unknown';
  }
}

export function isYepApiError(value: unknown): value is YepApiError {
  return value instanceof YepApiError;
}
