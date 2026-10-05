import { Injectable, type LoggerService } from '@nestjs/common';

import { sanitizeLogData } from './log-redactor';

export interface LogContext {
  correlationId?: string;
  tenantId?: string;
  userId?: string;
  workflowId?: string;
  agentExecutionId?: string;
  durationMs?: number;
  [key: string]: unknown;
}

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

@Injectable()
export class StructuredLoggerService implements LoggerService {
  private readonly defaultContext: string;

  constructor(context = 'Application') {
    this.defaultContext = context;
  }

  setContext(context: string): StructuredLoggerService {
    return new StructuredLoggerService(context);
  }

  log(message: string, context?: string | LogContext): void {
    this.emit('info', message, context);
  }

  error(message: string, trace?: string, context?: string | LogContext): void {
    const meta =
      typeof context === 'object' ? { ...context, stack: trace } : { context, stack: trace };
    this.emit('error', message, meta);
  }

  warn(message: string, context?: string | LogContext): void {
    this.emit('warn', message, context);
  }

  debug(message: string, context?: string | LogContext): void {
    this.emit('debug', message, context);
  }

  verbose(message: string, context?: string | LogContext): void {
    this.emit('trace', message, context);
  }

  fatal(message: string, context?: string | LogContext): void {
    this.emit('fatal', message, context);
  }

  private emit(level: LogLevel, message: string, contextOrMeta?: string | LogContext): void {
    const isStringContext = typeof contextOrMeta === 'string';
    const contextName = isStringContext ? contextOrMeta : this.defaultContext;
    const extraMeta =
      typeof contextOrMeta === 'object' && contextOrMeta !== null ? contextOrMeta : {};

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      context: contextName,
      ...(sanitizeLogData(extraMeta) as Record<string, unknown>),
    };

    const serialized = JSON.stringify(logEntry);
    if (level === 'error' || level === 'fatal') {
      process.stderr.write(serialized + '\n');
    } else {
      process.stdout.write(serialized + '\n');
    }
  }
}
