import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, raw } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // Stripe signature verification needs the unparsed body, so that one route opts out of JSON parsing.
  app.use('/billing/webhook/stripe', raw({ type: '*/*' }));
  app.use(json({ limit: '1mb' }));

  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = Number(process.env.PORT ?? 4322);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`OrderFlow API listening on http://0.0.0.0:${port}`);
}

void bootstrap();
