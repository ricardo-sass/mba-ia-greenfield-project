import { registerAs } from '@nestjs/config';

const parseBoolean = (value: string | undefined, defaultValue: boolean) => {
  if (value === undefined) {
    return defaultValue;
  }

  return value === 'true';
};

export default registerAs('storage', () => ({
  endpoint: process.env.STORAGE_ENDPOINT ?? 'http://minio:9000',
  region: process.env.STORAGE_REGION ?? 'us-east-1',
  bucket: process.env.STORAGE_BUCKET ?? 'streamtube-videos',
  accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? 'streamtube',
  secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? 'streamtube-minio',
  forcePathStyle: parseBoolean(process.env.STORAGE_FORCE_PATH_STYLE, true),
  uploadPartUrlTtlSeconds: parseInt(
    process.env.STORAGE_UPLOAD_PART_URL_TTL_SECONDS ?? '900',
    10,
  ),
  readUrlTtlSeconds: parseInt(
    process.env.STORAGE_READ_URL_TTL_SECONDS ?? '300',
    10,
  ),
}));
