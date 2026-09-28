import { registerAs } from '@nestjs/config';

export default registerAs('queue', () => ({
  redis: {
    host: process.env.QUEUE_REDIS_HOST ?? 'redis',
    port: parseInt(process.env.QUEUE_REDIS_PORT ?? '6379', 10),
    password: process.env.QUEUE_REDIS_PASSWORD || undefined,
  },
  videoProcessing: {
    attempts: parseInt(process.env.VIDEO_PROCESSING_ATTEMPTS ?? '3', 10),
    backoffMs: parseInt(process.env.VIDEO_PROCESSING_BACKOFF_MS ?? '30000', 10),
  },
}));
