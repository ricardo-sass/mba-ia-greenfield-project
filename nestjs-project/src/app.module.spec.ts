import { Test } from '@nestjs/testing';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppModule } from './app.module';
import databaseConfig from './config/database.config';
import queueConfig from './config/queue.config';

jest.mock('@nestjs/bullmq', () => ({
  ...jest.requireActual('@nestjs/bullmq'),
  BullModule: {
    ...jest.requireActual('@nestjs/bullmq').BullModule,
    forRootAsync: jest.fn(() => ({ module: class MockBullRootModule {} })),
  },
}));

jest.mock('@nestjs/typeorm', () => ({
  ...jest.requireActual('@nestjs/typeorm'),
  TypeOrmModule: {
    ...jest.requireActual('@nestjs/typeorm').TypeOrmModule,
    forRootAsync: jest.fn(() => ({ module: class MockTypeOrmRootModule {} })),
  },
}));

jest.mock('./auth/auth.module', () => ({
  AuthModule: class MockAuthModule {},
}));

jest.mock('./videos/videos.module', () => ({
  VideosModule: class MockVideosModule {},
}));

describe('AppModule', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DB_USERNAME: 'streamtube',
      DB_PASSWORD: 'streamtube',
      DB_NAME: 'streamtube',
      JWT_SECRET: 'access-secret',
      JWT_REFRESH_SECRET: 'refresh-secret',
      STORAGE_ENDPOINT: 'http://minio:9000',
      STORAGE_REGION: 'us-east-1',
      STORAGE_BUCKET: 'streamtube-videos',
      STORAGE_ACCESS_KEY_ID: 'streamtube',
      STORAGE_SECRET_ACCESS_KEY: 'streamtube-minio',
      QUEUE_REDIS_HOST: 'redis',
      QUEUE_REDIS_PORT: '6379',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should compile with storage and queue configuration registered', async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(module).toBeDefined();
    expect(BullModule.forRootAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        inject: [queueConfig.KEY],
      }),
    );
    expect(TypeOrmModule.forRootAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        inject: [databaseConfig.KEY],
      }),
    );
    await module.close();
  });
});
