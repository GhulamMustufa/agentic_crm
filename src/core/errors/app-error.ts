export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly errorCode: string;
  readonly isRetryable: boolean;
  readonly details?: Record<string, unknown> | Array<Record<string, unknown>>;

  constructor(
    message: string,
    options?: {
      cause?: unknown;
      isRetryable?: boolean;
      details?: Record<string, unknown> | Array<Record<string, unknown>>;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = this.constructor.name;
    this.isRetryable = options?.isRetryable ?? false;
    this.details = options?.details;
  }
}

export class DomainError extends AppError {
  readonly statusCode = 422;
  readonly errorCode: string;

  constructor(
    message: string,
    errorCode = 'DOMAIN_INVARIANT_VIOLATION',
    options?: { cause?: unknown; details?: Record<string, unknown> },
  ) {
    super(message, options);
    this.errorCode = errorCode;
  }
}

export class UnprocessableEntityError extends AppError {
  readonly statusCode = 422;
  readonly errorCode = 'UNPROCESSABLE_ENTITY';

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { details });
  }
}

export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly errorCode = 'VALIDATION_FAILED';

  constructor(message: string, details?: Array<{ field: string; message: string }>) {
    super(message, { details: details as unknown as Array<Record<string, unknown>> });
  }
}

export class AuthenticationError extends AppError {
  readonly statusCode = 401;
  readonly errorCode = 'UNAUTHORIZED';

  constructor(message = 'Authentication credentials missing or invalid') {
    super(message);
  }
}

export class AuthorizationError extends AppError {
  readonly statusCode = 403;
  readonly errorCode = 'FORBIDDEN';

  constructor(message = 'Insufficient permissions for this tenant resource') {
    super(message);
  }
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly errorCode = 'RESOURCE_NOT_FOUND';

  constructor(resource: string, identifier?: string) {
    const detail = identifier ? ` '${identifier}'` : '';
    super(`${resource}${detail} not found`);
  }
}

export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly errorCode = 'RESOURCE_CONFLICT';

  constructor(message: string, options?: { isRetryable?: boolean }) {
    super(message, { isRetryable: options?.isRetryable ?? false });
  }
}

export class InfrastructureError extends AppError {
  readonly statusCode = 500;
  readonly errorCode = 'INFRASTRUCTURE_FAILURE';

  constructor(message = 'Internal infrastructure service failure', cause?: unknown) {
    super(message, { cause, isRetryable: true });
  }
}

export class ExternalServiceError extends AppError {
  readonly statusCode = 502;
  readonly errorCode = 'EXTERNAL_SERVICE_FAILURE';

  constructor(
    serviceName: string,
    message: string,
    options?: { cause?: unknown; isRetryable?: boolean },
  ) {
    super(`External service '${serviceName}' error: ${message}`, options);
  }
}
