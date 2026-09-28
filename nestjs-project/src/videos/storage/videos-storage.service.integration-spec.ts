import { Test } from '@nestjs/testing';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import storageConfig from '../../config/storage.config';
import { VideosStorageService } from './videos-storage.service';

const storage = {
  endpoint: process.env.STORAGE_ENDPOINT ?? 'http://minio:9000',
  region: process.env.STORAGE_REGION ?? 'us-east-1',
  bucket: process.env.STORAGE_BUCKET ?? 'streamtube-videos',
  accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? 'streamtube',
  secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? 'streamtube-minio',
  forcePathStyle: (process.env.STORAGE_FORCE_PATH_STYLE ?? 'true') === 'true',
  uploadPartUrlTtlSeconds: Number(
    process.env.STORAGE_UPLOAD_PART_URL_TTL_SECONDS ?? 900,
  ),
  readUrlTtlSeconds: Number(process.env.STORAGE_READ_URL_TTL_SECONDS ?? 300),
};

describe('VideosStorageService (integration)', () => {
  let service: VideosStorageService;
  let s3Client: S3Client;

  beforeAll(async () => {
    s3Client = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      forcePathStyle: storage.forcePathStyle,
      credentials: {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
      },
    });

    try {
      await s3Client.send(new CreateBucketCommand({ Bucket: storage.bucket }));
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (
        name !== 'BucketAlreadyOwnedByYou' &&
        name !== 'BucketAlreadyExists'
      ) {
        throw error;
      }
    }

    const module = await Test.createTestingModule({
      providers: [
        VideosStorageService,
        {
          provide: storageConfig.KEY,
          useValue: storage,
        },
      ],
    }).compile();

    service = module.get(VideosStorageService);
  });

  afterAll(() => {
    s3Client.destroy();
  });

  it('initiates, signs, completes, aborts, and presigns reads against MinIO', async () => {
    const objectKey = `videos/raw/test-owner/test-video/${Date.now()}-clip.txt`;
    const init = await service.initiateMultipartUpload({
      objectKey,
      contentType: 'text/plain',
    });
    expect(init.uploadId).toBeTruthy();

    const uploadPart = await service.presignUploadPart({
      objectKey,
      uploadId: init.uploadId,
      partNumber: 1,
      contentLength: 11,
    });
    expect(uploadPart.expiresInSeconds).toBe(storage.uploadPartUrlTtlSeconds);

    const uploadResponse = await fetch(uploadPart.url, {
      method: 'PUT',
      body: 'hello video',
    });
    expect(uploadResponse.ok).toBe(true);

    const eTag = uploadResponse.headers.get('etag');
    expect(eTag).toBeTruthy();

    await service.completeMultipartUpload({
      objectKey,
      uploadId: init.uploadId,
      parts: [{ partNumber: 1, eTag: eTag as string }],
    });

    const streamUrl = await service.presignStreamUrl({ objectKey });
    expect(streamUrl.url).toContain(objectKey);
    expect(streamUrl.expiresInSeconds).toBe(storage.readUrlTtlSeconds);

    const readResponse = await fetch(streamUrl.url);
    expect(readResponse.ok).toBe(true);
    await expect(readResponse.text()).resolves.toBe('hello video');

    const abortKey = `videos/raw/test-owner/test-video/${Date.now()}-abort.txt`;
    const abortInit = await service.initiateMultipartUpload({
      objectKey: abortKey,
      contentType: 'text/plain',
    });

    await expect(
      service.abortMultipartUpload({
        objectKey: abortKey,
        uploadId: abortInit.uploadId,
      }),
    ).resolves.toBeUndefined();

    await s3Client.send(
      new DeleteObjectCommand({ Bucket: storage.bucket, Key: objectKey }),
    );
  }, 30000);
});
