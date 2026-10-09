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
  app.enableCors({
    origin: ['https://app.agenticos.com', 'http://localhost:3000'],
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
