import { describe, expect, it, vi } from 'vitest';

import { HttpClient } from '../src/http/client';
import { createTelemetryMiddleware, type TelemetryLogEvent } from '../src/http/middleware/telemetry';

describe('createTelemetryMiddleware', () => {
  it('logs success events', async () => {
    const events: TelemetryLogEvent[] = [];

    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const client = new HttpClient({
      providerId: 'test-provider',
      baseUrl: 'http://example.test',
      fetchFn,
      middlewares: [
        createTelemetryMiddleware({
          logger: (event) => {
            events.push(event);
          },
        }),
      ],
    });

    const response = await client.request({
      method: 'GET',
      path: '/health',
    });

    expect(response.status).toBe(200);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('http_success');
    expect(events[0]?.providerId).toBe('test-provider');
  });

  it('logs error events', async () => {
    const events: TelemetryLogEvent[] = [];

    const fetchFn = vi.fn(async () => {
      throw new Error('network down');
    });

    const client = new HttpClient({
      providerId: 'test-provider',
      baseUrl: 'http://example.test',
      fetchFn,
      retry: {
        maxAttempts: 1,
      },
      middlewares: [
        createTelemetryMiddleware({
          logger: (event) => {
            events.push(event);
          },
        }),
      ],
    });

    await expect(
      client.request({
        method: 'GET',
        path: '/health',
      })
    ).rejects.toThrow();

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('http_error');
    expect(events[0]?.errorMessage).toContain('network down');
  });
});
