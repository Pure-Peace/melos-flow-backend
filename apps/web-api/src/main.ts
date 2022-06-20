import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { HttpExceptionFilter } from '@MelosFlow/common';

import { DappWebModule } from './web-api.module';

async function bootstrap() {
  const app = await NestFactory.create(DappWebModule, { cors: true });
  const prefix = '/api';
  app.setGlobalPrefix(prefix);
  const options = new DocumentBuilder()
    .setTitle('MELOS-FLOW API')
    .setDescription('MELOS-FLOW API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  app.useGlobalFilters(new HttpExceptionFilter());

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup(prefix, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
  const service = app.get(ConfigService);
  const { port } = await service.get('web-api');
  await app.listen(Number(port), '0.0.0.0');
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
