import { envValidationSchema } from './env.validation';

const requiredEnv = {
  DB_USERNAME: 'user',
  DB_PASSWORD: 'pass',
  DB_NAME: 'db',
  JWT_SECRET: 'secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
  STORAGE_ENDPOINT: 'http://minio:9000',
  STORAGE_REGION: 'us-east-1',
  STORAGE_BUCKET: 'streamtube-videos',
  STORAGE_ACCESS_KEY_ID: 'streamtube',
  STORAGE_SECRET_ACCESS_KEY: 'streamtube-minio',
  QUEUE_REDIS_HOST: 'redis',
};

const validate = (env: Record<string, string>) =>
  envValidationSchema.validate(
    { ...requiredEnv, ...env },
    { allowUnknown: true, abortEarly: false },
  );

describe('envValidationSchema — SWAGGER_ENABLED', () => {
  it('should reject SWAGGER_ENABLED with an invalid value', () => {
    const { error } = validate({ SWAGGER_ENABLED: 'invalid' });
    expect(error).toBeDefined();
    expect(error!.message).toContain('SWAGGER_ENABLED');
  });

  it('should accept SWAGGER_ENABLED=true', () => {
    const { error } = validate({ SWAGGER_ENABLED: 'true' });
    expect(error).toBeUndefined();
  });

  it('should accept SWAGGER_ENABLED=false', () => {
    const { error } = validate({ SWAGGER_ENABLED: 'false' });
    expect(error).toBeUndefined();
  });

  it('should apply default false when SWAGGER_ENABLED is not set', () => {
    const { value, error } = validate({});
    expect(error).toBeUndefined();
    expect(value.SWAGGER_ENABLED).toBe('false');
  });
});

describe('envValidationSchema — video infrastructure', () => {
  it('should reject a non-HTTP public storage endpoint', () => {
    const { error } = validate({
      STORAGE_PUBLIC_ENDPOINT: 'ftp://media.example.com',
    });

    expect(error?.message).toContain('STORAGE_PUBLIC_ENDPOINT');
  });

  it('should accept a public endpoint separate from the Docker endpoint', () => {
    const { value, error } = validate({
      STORAGE_PUBLIC_ENDPOINT: 'https://media.example.com',
    });

    expect(error).toBeUndefined();
    expect(value.STORAGE_ENDPOINT).toBe('http://minio:9000');
    expect(value.STORAGE_PUBLIC_ENDPOINT).toBe('https://media.example.com');
  });

  it('should reject missing required storage values', () => {
    const { error } = validate({ STORAGE_ENDPOINT: undefined as never });

    expect(error).toBeDefined();
    expect(error!.message).toContain('STORAGE_ENDPOINT');
  });

  it('should reject missing required queue values', () => {
    const { error } = validate({ QUEUE_REDIS_HOST: undefined as never });

    expect(error).toBeDefined();
    expect(error!.message).toContain('QUEUE_REDIS_HOST');
  });

  it('should reject upload limits above 10GB', () => {
    const { error } = validate({
      VIDEO_MAX_UPLOAD_BYTES: `${10 * 1024 * 1024 * 1024 + 1}`,
    });

    expect(error).toBeDefined();
    expect(error!.message).toContain('VIDEO_MAX_UPLOAD_BYTES');
  });

  it('should reject signed URL TTL values below 60 seconds', () => {
    const { error } = validate({
      STORAGE_UPLOAD_PART_URL_TTL_SECONDS: '59',
      STORAGE_READ_URL_TTL_SECONDS: '30',
    });

    expect(error).toBeDefined();
    expect(error!.message).toContain('STORAGE_UPLOAD_PART_URL_TTL_SECONDS');
    expect(error!.message).toContain('STORAGE_READ_URL_TTL_SECONDS');
  });

  it('should accept Docker service hosts and default video infra values', () => {
    const { value, error } = validate({});

    expect(error).toBeUndefined();
    expect(value.DB_HOST).toBe('db');
    expect(value.STORAGE_ENDPOINT).toBe('http://minio:9000');
    expect(value.QUEUE_REDIS_HOST).toBe('redis');
    expect(value.STORAGE_PUBLIC_ENDPOINT).toBe('http://minio:9000');
    expect(value.VIDEO_MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024 * 1024);
    expect(value.STORAGE_UPLOAD_PART_URL_TTL_SECONDS).toBe(900);
    expect(value.STORAGE_READ_URL_TTL_SECONDS).toBe(300);
  });
});
