import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import storageConfig from '../../config/storage.config';
import {
  StorageMultipartAbortFailedException,
  StorageMultipartCompleteFailedException,
  StorageMultipartInitFailedException,
  StoragePresignFailedException,
} from '../../common/exceptions/domain.exception';

interface InitiateMultipartUploadInput {
  objectKey: string;
  contentType?: string;
  metadata?: Record<string, string>;
}

interface InitiateMultipartUploadResult {
  objectKey: string;
  uploadId: string;
}

interface PresignUploadPartInput {
  objectKey: string;
  uploadId: string;
  partNumber: number;
  contentLength?: number;
}

interface PresignedUrlResult {
  url: string;
  expiresInSeconds: number;
}

interface CompletedUploadPart {
  partNumber: number;
  eTag: string;
}

interface CompleteMultipartUploadInput {
  objectKey: string;
  uploadId: string;
  parts: CompletedUploadPart[];
}

interface AbortMultipartUploadInput {
  objectKey: string;
  uploadId: string;
}

interface PresignReadInput {
  objectKey: string;
  downloadFilename?: string;
}

interface UploadObjectInput {
  objectKey: string;
  body: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
}

@Injectable()
export class VideosStorageService {
  private readonly s3Client: S3Client;

  constructor(
    @Inject(storageConfig.KEY)
    private readonly storage: ConfigType<typeof storageConfig>,
  ) {
    this.s3Client = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      forcePathStyle: storage.forcePathStyle,
      credentials: {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
      },
    });
  }

  async initiateMultipartUpload(
    input: InitiateMultipartUploadInput,
  ): Promise<InitiateMultipartUploadResult> {
    try {
      const response = await this.s3Client.send(
        new CreateMultipartUploadCommand({
          Bucket: this.storage.bucket,
          Key: input.objectKey,
          ContentType: input.contentType,
          Metadata: input.metadata,
        }),
      );

      if (!response.UploadId) {
        throw new Error('Storage did not return an upload id');
      }

      return {
        objectKey: input.objectKey,
        uploadId: response.UploadId,
      };
    } catch {
      throw new StorageMultipartInitFailedException();
    }
  }

  async presignUploadPart(
    input: PresignUploadPartInput,
  ): Promise<PresignedUrlResult> {
    try {
      const url = await getSignedUrl(
        this.s3Client,
        new UploadPartCommand({
          Bucket: this.storage.bucket,
          Key: input.objectKey,
          UploadId: input.uploadId,
          PartNumber: input.partNumber,
          ContentLength: input.contentLength,
        }),
        { expiresIn: this.storage.uploadPartUrlTtlSeconds },
      );

      return {
        url,
        expiresInSeconds: this.storage.uploadPartUrlTtlSeconds,
      };
    } catch {
      throw new StoragePresignFailedException();
    }
  }

  async completeMultipartUpload(
    input: CompleteMultipartUploadInput,
  ): Promise<void> {
    try {
      await this.s3Client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.storage.bucket,
          Key: input.objectKey,
          UploadId: input.uploadId,
          MultipartUpload: {
            Parts: input.parts.map((part) => ({
              PartNumber: part.partNumber,
              ETag: part.eTag,
            })),
          },
        }),
      );
    } catch {
      throw new StorageMultipartCompleteFailedException();
    }
  }

  async abortMultipartUpload(input: AbortMultipartUploadInput): Promise<void> {
    try {
      await this.s3Client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.storage.bucket,
          Key: input.objectKey,
          UploadId: input.uploadId,
        }),
      );
    } catch {
      throw new StorageMultipartAbortFailedException();
    }
  }

  async presignStreamUrl(input: PresignReadInput): Promise<PresignedUrlResult> {
    return this.presignRead(input);
  }

  async presignDownloadUrl(
    input: Required<PresignReadInput>,
  ): Promise<PresignedUrlResult> {
    return this.presignRead(input);
  }

  async getObjectBuffer(objectKey: string): Promise<Buffer> {
    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.storage.bucket,
        Key: objectKey,
      }),
    );

    if (!response.Body) {
      return Buffer.alloc(0);
    }

    const body = response.Body as {
      transformToByteArray?: () => Promise<Uint8Array>;
    };
    if (body.transformToByteArray) {
      return Buffer.from(await body.transformToByteArray());
    }

    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as AsyncIterable<Buffer | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  async uploadObject(input: UploadObjectInput): Promise<void> {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.storage.bucket,
        Key: input.objectKey,
        Body: input.body,
        ContentType: input.contentType,
        Metadata: input.metadata,
      }),
    );
  }

  private async presignRead(
    input: PresignReadInput,
  ): Promise<PresignedUrlResult> {
    try {
      const url = await getSignedUrl(
        this.s3Client,
        new GetObjectCommand({
          Bucket: this.storage.bucket,
          Key: input.objectKey,
          ResponseContentDisposition: input.downloadFilename
            ? `attachment; filename="${input.downloadFilename}"`
            : undefined,
        }),
        { expiresIn: this.storage.readUrlTtlSeconds },
      );

      return {
        url,
        expiresInSeconds: this.storage.readUrlTtlSeconds,
      };
    } catch {
      throw new StoragePresignFailedException();
    }
  }
}
