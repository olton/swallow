import { ProviderError } from '../errors/index.js';

export interface RetryPolicy {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryOnStatuses?: number[];
}

export interface HttpMiddlewareContext {
  providerId: string;
  attempt: number;
  url: string;
  init: RequestInit;
}

export type HttpMiddleware = (
  context: HttpMiddlewareContext,
  next: (context: HttpMiddlewareContext) => Promise<Response>
) => Promise<Response>;

export interface HttpClientOptions {
  providerId: string;
  baseUrl: string;
  baseHeaders?: Record<string, string>;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  retry?: RetryPolicy;
  middlewares?: HttpMiddleware[];
}

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

const DEFAULT_RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];

export class HttpClient {
  private readonly providerId: string;
  private readonly baseUrl: string;
  private readonly baseHeaders: Record<string, string>;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number | undefined;
  private readonly retry: Required<RetryPolicy>;
  private readonly middlewares: HttpMiddleware[];

  constructor(options: HttpClientOptions) {
    this.providerId = options.providerId;
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.baseHeaders = options.baseHeaders ?? {};
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs;
    this.retry = {
      maxAttempts: options.retry?.maxAttempts ?? 1,
      baseDelayMs: options.retry?.baseDelayMs ?? 150,
      maxDelayMs: options.retry?.maxDelayMs ?? 2_000,
      retryOnStatuses: options.retry?.retryOnStatuses ?? DEFAULT_RETRYABLE_STATUSES,
    };
    this.middlewares = options.middlewares ?? [];
  }

  async request(options: HttpRequestOptions): Promise<Response> {
    const method = options.method ?? 'POST';
    const url = `${this.baseUrl}${options.path}`;

    let lastError: unknown;

    for (let attempt = 1; attempt <= this.retry.maxAttempts; attempt += 1) {
      const init = this.createRequestInit(method, options.body, options.headers, options.signal);
      const context: HttpMiddlewareContext = {
        providerId: this.providerId,
        attempt,
        url,
        init,
      };

      try {
        const response = await this.dispatchMiddlewares(context);

        if (!response.ok && this.shouldRetryStatus(response.status, attempt)) {
          await this.discardResponse(response);
          await this.delay(this.computeDelayMs(attempt));
          continue;
        }

        return response;
      } catch (error) {
        lastError = error;
        if (!this.shouldRetryError(error, attempt)) {
          throw new ProviderError(this.providerId, 'Network request failed', { cause: error });
        }

        await this.delay(this.computeDelayMs(attempt));
      }
    }

    throw new ProviderError(this.providerId, 'Network request failed after retries', {
      cause: lastError,
    });
  }

  async requestJson<T>(options: HttpRequestOptions): Promise<T> {
    const response = await this.request(options);

    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new ProviderError(this.providerId, 'Failed to parse JSON response', { cause: error });
    }
  }

  private createRequestInit(
    method: NonNullable<HttpRequestOptions['method']>,
    body: unknown,
    headers: Record<string, string> | undefined,
    signal: AbortSignal | undefined
  ): RequestInit {
    const mergedSignal = createMergedSignal(signal, this.timeoutMs);

    return {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...this.baseHeaders,
        ...(headers ?? {}),
      },
      body: body === undefined ? null : JSON.stringify(body),
      signal: mergedSignal,
    };
  }

  private async dispatchMiddlewares(context: HttpMiddlewareContext): Promise<Response> {
    const run = async (index: number, current: HttpMiddlewareContext): Promise<Response> => {
      const middleware = this.middlewares[index];
      if (!middleware) {
        return this.fetchFn(current.url, current.init);
      }

      return middleware(current, (nextContext) => run(index + 1, nextContext));
    };

    return run(0, context);
  }

  private shouldRetryStatus(status: number, attempt: number): boolean {
    if (attempt >= this.retry.maxAttempts) {
      return false;
    }

    return this.retry.retryOnStatuses.includes(status);
  }

  private shouldRetryError(error: unknown, attempt: number): boolean {
    if (attempt >= this.retry.maxAttempts) {
      return false;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      return false;
    }

    return true;
  }

  private computeDelayMs(attempt: number): number {
    const rawDelay = this.retry.baseDelayMs * Math.pow(2, Math.max(0, attempt - 1));
    return Math.min(rawDelay, this.retry.maxDelayMs);
  }

  private async discardResponse(response: Response): Promise<void> {
    try {
      if (response.body) {
        await response.body.cancel();
      }
    } catch {
      return;
    }
  }

  private async delay(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), ms);
    });
  }
}

function createMergedSignal(signal: AbortSignal | undefined, timeoutMs: number | undefined): AbortSignal | null {
  if (timeoutMs === undefined) {
    return signal ?? null;
  }

  const controller = new AbortController();
  const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
      return controller.signal;
    }

    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeoutId);
        controller.abort();
      },
      { once: true }
    );
  }

  controller.signal.addEventListener(
    'abort',
    () => {
      clearTimeout(timeoutId);
    },
    { once: true }
  );

  return controller.signal;
}
