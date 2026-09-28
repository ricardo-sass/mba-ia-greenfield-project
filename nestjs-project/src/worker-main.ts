import { NestFactory } from '@nestjs/core';
import { VideosWorkerModule } from './videos/processing/videos-worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(VideosWorkerModule);
  app.enableShutdownHooks();
}

void bootstrap();
