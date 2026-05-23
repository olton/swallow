import type { HttpMiddleware } from '../client.js';

export interface TelemetryLogEvent {
  type: 'http_success' | 'http_error';
  providerId: string;
  attempt: number;
  method: string;
  url: string;
  durationMs: number;
  status?: number;
  errorMessage?: string;
}

export type TelemetryLogger = (event: TelemetryLogEvent) => void;

export interface TelemetryMiddlewareOptions {
  logger?: TelemetryLogger;
}

export function createTelemetryMiddleware(options?: TelemetryMiddlewareOptions): HttpMiddleware {
  const logger = options?.logger ?? defaultLogger;

  return async (context, next) => {
    const startedAt = nowMs();
    const method = String(context.init.method ?? 'POST');

    try {
      const response = await next(context);
      logger({
        type: 'http_success',
        providerId: context.providerId,
        attempt: context.attempt,
        method,
        url: context.url,
        durationMs: nowMs() - startedAt,
        status: response.status,
      });

      return response;
    } catch (error) {
      logger({
        type: 'http_error',
        providerId: context.providerId,
        attempt: context.attempt,
        method,
        url: context.url,
        durationMs: nowMs() - startedAt,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}

function defaultLogger(event: TelemetryLogEvent): void {
  if (event.type === 'http_success') {
    console.info(
      `[${event.providerId}] ${event.method} ${event.url} -> ${event.status} (${event.durationMs.toFixed(1)}ms)`
    );
    return;
  }

  console.error(
    `[${event.providerId}] ${event.method} ${event.url} -> ERROR (${event.durationMs.toFixed(1)}ms): ${event.errorMessage ?? 'unknown error'}`
  );
}
