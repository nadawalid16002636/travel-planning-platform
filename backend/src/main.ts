
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Prefix all API endpoints with /api
  app.setGlobalPrefix('api');

  // Enable validation for incoming requests
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Travel Planning Platform API')
    .setDescription(
      'REST API for Airlines, Flights, Bookings, Hotels, and more',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('session')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document);

  // Start server
  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`Server running on http://localhost:${port}`);
  console.log(`Swagger available at http://localhost:${port}/api/docs`);
}

bootstrap();
