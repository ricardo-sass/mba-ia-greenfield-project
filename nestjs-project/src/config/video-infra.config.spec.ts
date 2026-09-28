import queueConfig from './queue.config';
import storageConfig from './storage.config';

describe('video infrastructure config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should expose storage defaults with Docker service host', () => {
    delete process.env.STORAGE_ENDPOINT;
    delete process.env.STORAGE_PUBLIC_ENDPOINT;
    delete process.env.STORAGE_REGION;
    delete process.env.STORAGE_BUCKET;
    delete process.env.STORAGE_ACCESS_KEY_ID;
    delete process.env.STORAGE_SECRET_ACCESS_KEY;
    delete process.env.STORAGE_FORCE_PATH_STYLE;
    delete process.env.STORAGE_UPLOAD_PART_URL_TTL_SECONDS;
    delete process.env.STORAGE_READ_URL_TTL_SECONDS;

    expect(storageConfig()).toEqual(
      expect.objectContaining({
        endpoint: 'http://minio:9000',
        publicEndpoint: 'http://minio:9000',
        region: 'us-east-1',
        bucket: 'streamtube-videos',
        accessKeyId: 'streamtube',
        secretAccessKey: 'streamtube-minio',
        forcePathStyle: true,
        uploadPartUrlTtlSeconds: 900,
        readUrlTtlSeconds: 300,
      }),
    );
  });

  it('should parse storage env values', () => {
    process.env.STORAGE_ENDPOINT = 'http://storage:9000';
    process.env.STORAGE_PUBLIC_ENDPOINT = 'https://media.example.com';
    process.env.STORAGE_REGION = 'sa-east-1';
    process.env.STORAGE_BUCKET = 'custom-bucket';
    process.env.STORAGE_ACCESS_KEY_ID = 'access-key';
    process.env.STORAGE_SECRET_ACCESS_KEY = 'secret-key';
    process.env.STORAGE_FORCE_PATH_STYLE = 'false';
    process.env.STORAGE_UPLOAD_PART_URL_TTL_SECONDS = '1200';
    process.env.STORAGE_READ_URL_TTL_SECONDS = '600';

    expect(storageConfig()).toEqual({
      endpoint: 'http://storage:9000',
      publicEndpoint: 'https://media.example.com',
      region: 'sa-east-1',
      bucket: 'custom-bucket',
      accessKeyId: 'access-key',
      secretAccessKey: 'secret-key',
      forcePathStyle: false,
      uploadPartUrlTtlSeconds: 1200,
      readUrlTtlSeconds: 600,
    });
  });

  it('should expose queue defaults with Docker Redis service host', () => {
    delete process.env.QUEUE_REDIS_HOST;
    delete process.env.QUEUE_REDIS_PORT;
    delete process.env.QUEUE_REDIS_PASSWORD;
    delete process.env.VIDEO_PROCESSING_ATTEMPTS;
    delete process.env.VIDEO_PROCESSING_BACKOFF_MS;

    expect(queueConfig()).toEqual({
      redis: {
        host: 'redis',
        port: 6379,
        password: undefined,
      },
      videoProcessing: {
        attempts: 3,
        backoffMs: 30000,
      },
    });
  });

  it('should parse queue env values', () => {
    process.env.QUEUE_REDIS_HOST = 'redis-primary';
    process.env.QUEUE_REDIS_PORT = '6380';
    process.env.QUEUE_REDIS_PASSWORD = 'redis-pass';
    process.env.VIDEO_PROCESSING_ATTEMPTS = '5';
    process.env.VIDEO_PROCESSING_BACKOFF_MS = '45000';

    expect(queueConfig()).toEqual({
      redis: {
        host: 'redis-primary',
        port: 6380,
        password: 'redis-pass',
      },
      videoProcessing: {
        attempts: 5,
        backoffMs: 45000,
      },
    });
  });
});
