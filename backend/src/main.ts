import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService<AppConfig, true>);

  app.setGlobalPrefix('api', { exclude: ['ws/(.*)'] });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.enableCors({
    origin: config.get('corsOrigin', { infer: true }),
    credentials: true,
  });

  const port = config.get('port', { infer: true });
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`CloudPhone backend listening on http://localhost:${port}`);
  logger.log(`REST base: /api   WebSocket: ws://localhost:${port}/ws/stream`);
  if (config.get('mockDevices', { infer: true })) {
    logger.warn('MOCK_DEVICES=true — virtual devices injected; no real adb connection.');
  }
}
bootstrap();
