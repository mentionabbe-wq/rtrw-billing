import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  const config = app.get(ConfigService);

  // Batas bawaan Express 100 KB terlalu kecil untuk unggahan gambar base64
  // (mis. QRIS statis & logo portal) — request akan ditolak 413 tanpa jejak.
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.get('corsOrigin'), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  const swagger = new DocumentBuilder()
    .setTitle('RT/RW Net Billing API')
    .setDescription('Billing, Mikrotik control & SNMP OLT monitoring')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  const port = config.get<number>('port');
  await app.listen(port);
  new Logger('Bootstrap').log(`API running on http://localhost:${port}/api (docs: /api/docs)`);
}
bootstrap();
