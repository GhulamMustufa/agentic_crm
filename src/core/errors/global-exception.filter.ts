import {
  type ArgumentsHost,
  type ExceptionFilter,
  Catch,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { AppError } from './app-error';
import { StructuredLoggerService } from '../logging/logger.service';

import type { Request, Response } from 'express';

export interface ErrorResponseEnvelope {
  statusCode: number;
  errorCode: string;
  message: string;
  details?: unknown;
  correlationId: string;
  timestamp: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new StructuredLoggerService('GlobalExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const correlationId = (request?.headers?.['x-correlation-id'] as string) || uuidv4();
    const timestamp = new Date().toISOString();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected internal error occurred';
    let details: unknown = undefined;

    if (exception instanceof AppError) {
      statusCode = exception.statusCode;
      errorCode = exception.errorCode;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      errorCode = `HTTP_${statusCode}`;
      const httpRes = exception.getResponse();
      if (typeof httpRes === 'string') {
        message = httpRes;
      } else if (typeof httpRes === 'object' && httpRes !== null) {
        const obj = httpRes as Record<string, unknown>;
        message = (obj['message'] as string) || exception.message;
        details = obj['error'] ?? obj['details'];
      }
    } else if (exception instanceof Error) {
      // In production, mask arbitrary unhandled runtime error messages
      message = exception.message;
    }

    if (statusCode >= 500) {
      this.logger.error(
        `Unhandled system exception: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
        {
          correlationId,
          statusCode,
          errorCode,
          path: request?.url,
          method: request?.method,
        },
      );
    } else {
      this.logger.warn(`Handled client exception: ${message}`, {
        correlationId,
        statusCode,
        errorCode,
        path: request?.url,
        method: request?.method,
      });
    }

    const payload: ErrorResponseEnvelope = {
      statusCode,
      errorCode,
      message,
      ...(details ? { details } : {}),
      correlationId,
      timestamp,
    };

    response.status(statusCode).json(payload);
  }
}
