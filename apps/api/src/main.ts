import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  // `rawBody: true` captures the unparsed body so the Paddle webhook can verify
  // its HMAC signature over the exact bytes Paddle signed.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const config = app.get(ConfigService);

  // Parse cookies so the JWT strategy can read the httpOnly access/refresh cookies.
  app.use(cookieParser());

  // Restrict CORS to the web origin and allow credentials so the browser
  // sends/receives the auth cookies (Slice 9 — was previously origin:true).
  const webOrigin = config.get<string>('WEB_ORIGIN', 'http://localhost:3000');
  app.enableCors({ origin: webOrigin, credentials: true });

  // Global validation — DTOs are validated/sanitized everywhere (project rule).
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.setGlobalPrefix('api');

  const port = config.get<number>('PORT', 3001);
  await app.listen(port);

  // eslint-disable-next-line no-console
  console.log(`Archivato API listening on http://localhost:${port}/api`);
}

bootstrap();
