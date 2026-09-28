import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  StorageMultipartAbortFailedException,
  StorageMultipartCompleteFailedException,
  StorageMultipartInitFailedException,
  StoragePresignFailedException,
} from '../../common/exceptions/domain.exception';
import { VideosStorageService } from './videos-storage.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

const storage = {
  endpoint: 'http://minio:9000',
  region: 'us-east-1',
  bucket: 'streamtube-videos',
  accessKeyId: 'streamtube',
  secretAccessKey: 'streamtube-minio',
  forcePathStyle: true,
  uploadPartUrlTtlSeconds: 900,
  readUrlTtlSeconds: 300,
};

describe('VideosStorageService', () => {
  let service: VideosStorageService;
  let sendSpy: jest.SpiedFunction<S3Client['send']>;
  const getSignedUrlMock = jest.mocked(getSignedUrl);

  beforeEach(() => {
    jest.clearAllMocks();
    sendSpy = jest.spyOn(S3Client.prototype, 'send');
    service = new VideosStorageService(storage);
  });

  afterEach(() => {
    sendSpy.mockRestore();
  });

  it('initiates multipart uploads with bucket, key, content type, and metadata', async () => {
    sendSpy.mockResolvedValueOnce({ UploadId: 'upload-1' } as never);

    await expect(
      service.initiateMultipartUpload({
        objectKey: 'videos/raw/u1/v1/clip.mp4',
        contentType: 'video/mp4',
        metadata: { ownerUserId: 'u1' },
      }),
    ).resolves.toEqual({
      objectKey: 'videos/raw/u1/v1/clip.mp4',
      uploadId: 'upload-1',
    });

    const command = sendSpy.mock.calls[0][0] as CreateMultipartUploadCommand;
    expect(command).toBeInstanceOf(CreateMultipartUploadCommand);
    expect(command.input).toEqual({
      Bucket: 'streamtube-videos',
      Key: 'videos/raw/u1/v1/clip.mp4',
      ContentType: 'video/mp4',
      Metadata: { ownerUserId: 'u1' },
    });
  });

  it('maps multipart init failures to a domain exception', async () => {
    sendSpy.mockRejectedValueOnce(new Error('storage down') as never);

    await expect(
      service.initiateMultipartUpload({
        objectKey: 'videos/raw/u1/v1/clip.mp4',
      }),
    ).rejects.toThrow(StorageMultipartInitFailedException);
  });

  it('presigns upload part URLs with configured expiry', async () => {
    getSignedUrlMock.mockResolvedValueOnce('http://signed-upload-url');

    await expect(
      service.presignUploadPart({
        objectKey: 'videos/raw/u1/v1/clip.mp4',
        uploadId: 'upload-1',
        partNumber: 3,
        contentLength: 10,
      }),
    ).resolves.toEqual({
      url: 'http://signed-upload-url',
      expiresInSeconds: 900,
    });

    const [, command, options] = getSignedUrlMock.mock.calls[0];
    expect(command).toBeInstanceOf(UploadPartCommand);
    expect(command.input).toEqual({
      Bucket: 'streamtube-videos',
      Key: 'videos/raw/u1/v1/clip.mp4',
      UploadId: 'upload-1',
      PartNumber: 3,
      ContentLength: 10,
    });
    expect(options).toEqual({ expiresIn: 900 });
  });

  it('completes multipart uploads with sorted caller-provided ETags', async () => {
    sendSpy.mockResolvedValueOnce({} as never);

    await service.completeMultipartUpload({
      objectKey: 'videos/raw/u1/v1/clip.mp4',
      uploadId: 'upload-1',
      parts: [
        { partNumber: 1, eTag: '"etag-1"' },
        { partNumber: 2, eTag: '"etag-2"' },
      ],
    });

    const command = sendSpy.mock.calls[0][0] as CompleteMultipartUploadCommand;
    expect(command).toBeInstanceOf(CompleteMultipartUploadCommand);
    expect(command.input).toEqual({
      Bucket: 'streamtube-videos',
      Key: 'videos/raw/u1/v1/clip.mp4',
      UploadId: 'upload-1',
      MultipartUpload: {
        Parts: [
          { PartNumber: 1, ETag: '"etag-1"' },
          { PartNumber: 2, ETag: '"etag-2"' },
        ],
      },
    });
  });

  it('maps multipart complete failures to a domain exception', async () => {
    sendSpy.mockRejectedValueOnce(new Error('complete failed') as never);

    await expect(
      service.completeMultipartUpload({
        objectKey: 'videos/raw/u1/v1/clip.mp4',
        uploadId: 'upload-1',
        parts: [{ partNumber: 1, eTag: '"etag-1"' }],
      }),
    ).rejects.toThrow(StorageMultipartCompleteFailedException);
  });

  it('aborts multipart uploads by bucket, key, and upload id', async () => {
    sendSpy.mockResolvedValueOnce({} as never);

    await service.abortMultipartUpload({
      objectKey: 'videos/raw/u1/v1/clip.mp4',
      uploadId: 'upload-1',
    });

    const command = sendSpy.mock.calls[0][0] as AbortMultipartUploadCommand;
    expect(command).toBeInstanceOf(AbortMultipartUploadCommand);
    expect(command.input).toEqual({
      Bucket: 'streamtube-videos',
      Key: 'videos/raw/u1/v1/clip.mp4',
      UploadId: 'upload-1',
    });
  });

  it('maps multipart abort failures to a domain exception', async () => {
    sendSpy.mockRejectedValueOnce(new Error('abort failed') as never);

    await expect(
      service.abortMultipartUpload({
        objectKey: 'videos/raw/u1/v1/clip.mp4',
        uploadId: 'upload-1',
      }),
    ).rejects.toThrow(StorageMultipartAbortFailedException);
  });

  it('presigns stream URLs with read expiry', async () => {
    getSignedUrlMock.mockResolvedValueOnce('http://signed-stream-url');

    await expect(
      service.presignStreamUrl({
        objectKey: 'videos/processed/u1/v1/clip.mp4',
      }),
    ).resolves.toEqual({
      url: 'http://signed-stream-url',
      expiresInSeconds: 300,
    });

    const [, command, options] = getSignedUrlMock.mock.calls[0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'streamtube-videos',
      Key: 'videos/processed/u1/v1/clip.mp4',
      ResponseContentDisposition: undefined,
    });
    expect(options).toEqual({ expiresIn: 300 });
  });

  it('presigns download URLs with attachment disposition', async () => {
    getSignedUrlMock.mockResolvedValueOnce('http://signed-download-url');

    await service.presignDownloadUrl({
      objectKey: 'videos/processed/u1/v1/clip.mp4',
      downloadFilename: 'clip.mp4',
    });

    const [, command] = getSignedUrlMock.mock.calls[0];
    const getObjectCommand = command as GetObjectCommand;
    expect(getObjectCommand).toBeInstanceOf(GetObjectCommand);
    expect(getObjectCommand.input.ResponseContentDisposition).toBe(
      'attachment; filename="clip.mp4"',
    );
  });

  it('maps presign failures to a domain exception', async () => {
    getSignedUrlMock.mockRejectedValueOnce(new Error('presign failed'));

    await expect(
      service.presignUploadPart({
        objectKey: 'videos/raw/u1/v1/clip.mp4',
        uploadId: 'upload-1',
        partNumber: 1,
      }),
    ).rejects.toThrow(StoragePresignFailedException);
  });
});
