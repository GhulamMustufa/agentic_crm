import { NestFactory } from '@nestjs/core';
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
