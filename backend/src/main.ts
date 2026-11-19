import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { applySwaggerExamples } from './docs/swagger-examples.js';

async function bootstrap() {
  // rawBody is needed to verify Stripe webhook signatures (PAY-01)
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableCors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:3001', credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const config = new DocumentBuilder()
    .setTitle('Travel Planning and Booking Platform API')
    .setVersion('1.0')
    .addCookieAuth('access_token')
    .build();
  // P6: ready-to-run request examples for every JSON body (backend/src/docs/swagger-examples.ts)
  const document = applySwaggerExamples(SwaggerModule.createDocument(app, config));
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { withCredentials: true, persistAuthorization: true },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`API on http://localhost:${port}/api  |  Swagger on http://localhost:${port}/api/docs`);
}
await bootstrap();
