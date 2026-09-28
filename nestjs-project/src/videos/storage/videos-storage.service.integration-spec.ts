import { Test } from '@nestjs/testing';
import { request, type IncomingHttpHeaders } from 'node:http';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import storageConfig from '../../config/storage.config';
import { VideosStorageService } from './videos-storage.service';

const storage = {
  endpoint: process.env.STORAGE_ENDPOINT ?? 'http://minio:9000',
  publicEndpoint: 'http://media.example.test:9000',
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

// Route through Docker while preserving the client-facing signed Host header.
async function requestSignedUrl(
  signedUrl: string,
  options: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<{
  status: number | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}> {
  const publicUrl = new URL(signedUrl);
  const internalUrl = new URL(storage.endpoint);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: internalUrl.hostname,
        port: internalUrl.port,
        path: publicUrl.pathname + publicUrl.search,
        method: options.method ?? 'GET',
        headers: {
          Host: publicUrl.host,
          ...(options.body
            ? { 'Content-Length': Buffer.byteLength(options.body) }
            : {}),
          ...options.headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.on('error', reject);
    req.setTimeout(10000, () =>
      req.destroy(new Error('Signed storage request timed out')),
    );
    req.end(options.body);
  });
}

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

    expect(new URL(uploadPart.url).origin).toBe(storage.publicEndpoint);
    const uploadResponse = await requestSignedUrl(uploadPart.url, {
      method: 'PUT',
      body: 'hello video',
    });
    expect(uploadResponse.status).toBe(200);

    const eTag = uploadResponse.headers.etag;
    expect(eTag).toBeTruthy();

    await service.completeMultipartUpload({
      objectKey,
      uploadId: init.uploadId,
      parts: [{ partNumber: 1, eTag: eTag as string }],
    });

    const streamUrl = await service.presignStreamUrl({ objectKey });
    expect(streamUrl.url).toContain(objectKey);
    expect(streamUrl.expiresInSeconds).toBe(storage.readUrlTtlSeconds);

    expect(new URL(streamUrl.url).origin).toBe(storage.publicEndpoint);
    const readResponse = await requestSignedUrl(streamUrl.url, {
      headers: { Range: 'bytes=0-4' },
    });
    expect(readResponse.status).toBe(206);
    expect(readResponse.headers['content-range']).toBe('bytes 0-4/11');
    expect(readResponse.body).toBe('hello');

    const downloadUrl = await service.presignDownloadUrl({
      objectKey,
      downloadFilename: 'clip.txt',
    });
    expect(new URL(downloadUrl.url).origin).toBe(storage.publicEndpoint);
    const downloadResponse = await requestSignedUrl(downloadUrl.url);
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers['content-disposition']).toBe(
      'attachment; filename="clip.txt"',
    );
    expect(downloadResponse.body).toBe('hello video');

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
