import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { AppConfigService } from './core/config/config.service';
import { GlobalExceptionFilter } from './core/errors/global-exception.filter';
import { StructuredLoggerService } from './core/logging/logger.service';

async function bootstrap() {
  const logger = new StructuredLoggerService('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const config = app.get(AppConfigService);

  // Increase payload limit for large multi-page bank statements & document OCR (up to 50MB)
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // Global Exception Filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Security Headers
  app.use(helmet());

  // CORS configuration
  const allowedOrigins = [
    'https://app.agenticos.com',
    'http://localhost:3000',
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ];

  app.enableCors({
    origin: (
      requestOrigin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!requestOrigin) {return callback(null, true);}
      try {
        const url = new URL(requestOrigin);
        if (
          allowedOrigins.includes(requestOrigin) ||
          url.hostname.endsWith('.vercel.app') ||
          url.hostname === 'localhost'
        ) {
          return callback(null, true);
        }
      } catch {
        // Ignore URL parsing errors for non-standard origins
      }
      callback(null, false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const port = config.get('PORT');
  await app.listen(port);
  logger.log(`Agentic Business OS API running on port ${port} in ${config.get('NODE_ENV')} mode`);
}

if (process.env.NODE_ENV !== 'test') {
  void bootstrap();
}
