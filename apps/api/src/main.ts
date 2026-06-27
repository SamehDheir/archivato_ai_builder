import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Allow the Next.js dev client (apps/web) to call the API.
  app.enableCors({ origin: true });

  // Global validation — DTOs are validated/sanitized everywhere (project rule).
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.setGlobalPrefix('api');

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3001);
  await app.listen(port);

  // eslint-disable-next-line no-console
  console.log(`Archivato API listening on http://localhost:${port}/api`);
}

bootstrap();
