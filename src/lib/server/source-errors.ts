import "server-only";

export type SourceErrorCode =
  | "INVALID_URL"
  | "BLOCKED_URL"
  | "FETCH_TIMEOUT"
  | "FETCH_FAILED"
  | "CONTENT_TOO_LARGE"
  | "UNSUPPORTED_CONTENT"
  | "EMPTY_CONTENT";

export class SourceError extends Error {
  constructor(
    public readonly code: SourceErrorCode,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "SourceError";
  }
}
