export class SdkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = 'SdkError';
  }
}

export class ProviderError extends SdkError {
  readonly providerId: string;

  constructor(providerId: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProviderError';
    this.providerId = providerId;
  }
}

export class HttpError extends ProviderError {
  readonly status: number;
  readonly statusText: string;
  readonly body?: string;

  constructor(
    providerId: string,
    status: number,
    statusText: string,
    body?: string,
    options?: { cause?: unknown }
  ) {
    super(providerId, `HTTP ${status} ${statusText}`, options);
    this.name = 'HttpError';
    this.status = status;
    this.statusText = statusText;
    if (body !== undefined) {
      this.body = body;
    }
  }
}
