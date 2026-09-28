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
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
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
  body: NonNullable<PutObjectCommandInput['Body']>;
  contentType?: string;
  metadata?: Record<string, string>;
}

interface UploadObjectFromFileInput {
  objectKey: string;
  filePath: string;
  contentType?: string;
  metadata?: Record<string, string>;
}

interface DownloadObjectToFileInput {
  objectKey: string;
  filePath: string;
}

@Injectable()
export class VideosStorageService {
  private readonly s3Client: S3Client;
  private readonly presignClient: S3Client;

  constructor(
    @Inject(storageConfig.KEY)
    private readonly storage: ConfigType<typeof storageConfig>,
  ) {
    const clientConfig = {
      region: storage.region,
      forcePathStyle: storage.forcePathStyle,
      credentials: {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
      },
    };
    this.s3Client = new S3Client({
      ...clientConfig,
      endpoint: storage.endpoint,
    });
    // The public host must be part of the signature, not rewritten afterwards.
    this.presignClient = new S3Client({
      ...clientConfig,
      endpoint: storage.publicEndpoint,
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
        this.presignClient,
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

  async downloadObjectToFile(input: DownloadObjectToFileInput): Promise<void> {
    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.storage.bucket,
        Key: input.objectKey,
      }),
    );

    if (!response.Body) {
      throw new Error(`Storage object ${input.objectKey} returned no body`);
    }

    await pipeline(
      this.asNodeReadableStream(response.Body),
      createWriteStream(input.filePath),
    );
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

  async uploadObjectFromFile(input: UploadObjectFromFileInput): Promise<void> {
    await this.uploadObject({
      objectKey: input.objectKey,
      body: createReadStream(input.filePath),
      contentType: input.contentType,
      metadata: input.metadata,
    });
  }

  private async presignRead(
    input: PresignReadInput,
  ): Promise<PresignedUrlResult> {
    try {
      const url = await getSignedUrl(
        this.presignClient,
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

  private asNodeReadableStream(body: unknown): NodeJS.ReadableStream {
    const stream = body as Partial<NodeJS.ReadableStream>;
    if (typeof stream.pipe !== 'function') {
      throw new Error('Storage object body is not a Node.js readable stream');
    }

    return stream as NodeJS.ReadableStream;
  }
}
