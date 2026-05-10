export class FlappieApiError extends Error {
  override readonly name = "FlappieApiError";
  readonly status: number | undefined;
  readonly body: unknown;

  constructor(message: string, opts: { status?: number; body?: unknown } = {}) {
    super(message);
    this.status = opts.status;
    this.body = opts.body;
  }
}
