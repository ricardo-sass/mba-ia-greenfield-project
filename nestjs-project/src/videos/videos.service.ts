import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Channel } from '../channels/entities/channel.entity';
import {
  InvalidVideoUploadPartsException,
  VideoNotFoundException,
  VideoNotOwnedException,
  VideoNotReadyException,
  VideoProcessingAlreadyEnqueuedException,
  VideoProcessingEnqueueFailedException,
  VideoUploadNotOpenException,
} from '../common/exceptions/domain.exception';
import {
  VideoProcessingJob,
  VideoProcessingJobStatus,
} from './entities/video-processing-job.entity';
import { VideoUploadPart } from './entities/video-upload-part.entity';
import { Video, VideoStatus } from './entities/video.entity';
import { VideosStorageService } from './storage/videos-storage.service';
import { VideoObjectKeysService } from './video-object-keys.service';
import { VideoProcessingQueueService } from './video-processing-queue.service';
import { VideoPublicIdService } from './video-public-id.service';
import { VIDEO_UPLOAD_LIMITS } from './videos.constants';
import type {
  AbortVideoUploadInput,
  AbortVideoUploadResult,
  CompleteVideoUploadInput,
  CompleteVideoUploadPartInput,
  CompleteVideoUploadResult,
  InitiateVideoUploadForOwnerInput,
  InitiateVideoUploadInput,
  InitiateVideoUploadResult,
  VideoAccessUrlInput,
  VideoDetailInput,
  VideoDetailResult,
  VideoDownloadUrlResult,
  VideoStreamUrlResult,
  SignVideoUploadPartsInput,
  SignVideoUploadPartsResult,
} from './videos.types';

@Injectable()
export class VideosService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Video)
    private readonly videosRepository: Repository<Video>,
    @InjectRepository(VideoProcessingJob)
    private readonly processingJobsRepository: Repository<VideoProcessingJob>,
    private readonly storageService: VideosStorageService,
    private readonly objectKeysService: VideoObjectKeysService,
    private readonly publicIdService: VideoPublicIdService,
    private readonly processingQueueService: VideoProcessingQueueService,
  ) {}

  async initiateUploadForOwner(
    input: InitiateVideoUploadForOwnerInput,
  ): Promise<InitiateVideoUploadResult> {
    const channel = await this.dataSource.getRepository(Channel).findOne({
      where: { user_id: input.ownerUserId },
    });
    if (!channel) {
      throw new VideoNotOwnedException();
    }

    return this.initiateUpload({
      ...input,
      channelId: channel.id,
    });
  }

  async initiateUpload(
    input: InitiateVideoUploadInput,
  ): Promise<InitiateVideoUploadResult> {
    this.validateInitiateInput(input);

    return this.dataSource.transaction(async (manager) => {
      const channel = await manager.findOne(Channel, {
        where: { id: input.channelId, user_id: input.ownerUserId },
      });
      if (!channel) {
        throw new VideoNotOwnedException();
      }

      const video = await this.publicIdService.createWithUniquePublicId(
        (publicId) =>
          manager.save(
            Video,
            manager.create(Video, {
              owner_user_id: input.ownerUserId,
              channel_id: input.channelId,
              public_id: publicId,
              status: VideoStatus.UPLOADING,
              original_filename: input.originalFilename,
              mime_type: input.mimeType,
              size_bytes: String(input.sizeBytes),
            }),
          ),
      );

      const objectKey = this.objectKeysService.raw({
        ownerUserId: input.ownerUserId,
        videoId: video.id,
        filename: input.originalFilename,
      });
      const multipart = await this.storageService.initiateMultipartUpload({
        objectKey,
        contentType: input.mimeType,
        metadata: {
          ownerUserId: input.ownerUserId,
          videoId: video.id,
        },
      });

      video.original_object_key = multipart.objectKey;
      video.multipart_upload_id = multipart.uploadId;
      await manager.save(Video, video);

      return {
        id: video.id,
        publicId: video.public_id,
        status: VideoStatus.UPLOADING,
        multipartUploadId: multipart.uploadId,
        objectKey: multipart.objectKey,
        partSizeBytes: this.calculatePartSize(input.sizeBytes, input.partCount),
      };
    });
  }

  async signUploadParts(
    input: SignVideoUploadPartsInput,
  ): Promise<SignVideoUploadPartsResult> {
    const video = await this.findOwnedVideo(input.videoId, input.ownerUserId);
    this.assertUploadOpen(video);
    const partNumbers = this.validatePartNumbers(input.partNumbers);

    const parts = await Promise.all(
      partNumbers.map(async (partNumber) => {
        const signed = await this.storageService.presignUploadPart({
          objectKey: video.original_object_key as string,
          uploadId: video.multipart_upload_id as string,
          partNumber,
        });

        return {
          partNumber,
          uploadUrl: signed.url,
          expiresInSeconds: signed.expiresInSeconds,
        };
      }),
    );

    return {
      videoId: video.id,
      expiresInSeconds: parts[0]?.expiresInSeconds ?? 0,
      parts: parts.map(({ partNumber, uploadUrl }) => ({
        partNumber,
        uploadUrl,
      })),
    };
  }

  async completeUpload(
    input: CompleteVideoUploadInput,
  ): Promise<CompleteVideoUploadResult> {
    const parts = this.validateCompleteParts(input.parts);

    const completion = await this.dataSource.transaction(async (manager) => {
      const video = await manager.findOne(Video, {
        where: { id: input.videoId },
        relations: { processing_jobs: true },
      });
      this.assertFoundAndOwned(video, input.ownerUserId);
      this.assertCompletable(video);

      await manager.delete(VideoUploadPart, { video_id: video.id });
      await manager.save(
        VideoUploadPart,
        parts.map((part) =>
          manager.create(VideoUploadPart, {
            video_id: video.id,
            part_number: part.partNumber,
            etag: part.eTag,
            size_bytes:
              part.sizeBytes === undefined ? null : String(part.sizeBytes),
          }),
        ),
      );

      await this.storageService.completeMultipartUpload({
        objectKey: video.original_object_key as string,
        uploadId: video.multipart_upload_id as string,
        parts,
      });

      video.status = VideoStatus.PROCESSING;
      video.multipart_upload_id = null;
      await manager.save(Video, video);

      const processingJob = await manager.save(
        VideoProcessingJob,
        manager.create(VideoProcessingJob, {
          video_id: video.id,
          status: VideoProcessingJobStatus.QUEUED,
        }),
      );

      return { video, processingJob };
    });

    let bullmqJobId: string;
    try {
      bullmqJobId = await this.processingQueueService.enqueueProcessJob({
        videoId: completion.video.id,
        originalObjectKey: completion.video.original_object_key as string,
        attempt: 1,
      });
    } catch {
      throw new VideoProcessingEnqueueFailedException();
    }

    await this.processingJobsRepository.update(completion.processingJob.id, {
      bullmq_job_id: bullmqJobId,
    });

    return {
      id: completion.video.id,
      publicId: completion.video.public_id,
      status: VideoStatus.PROCESSING,
      processingJobId: completion.processingJob.id,
    };
  }

  async abortUpload(
    input: AbortVideoUploadInput,
  ): Promise<AbortVideoUploadResult> {
    const video = await this.findOwnedVideo(input.videoId, input.ownerUserId);
    this.assertUploadOpen(video);

    await this.storageService.abortMultipartUpload({
      objectKey: video.original_object_key as string,
      uploadId: video.multipart_upload_id as string,
    });

    return this.dataSource.transaction(async (manager) => {
      await manager.delete(VideoUploadPart, { video_id: video.id });

      video.status = VideoStatus.DRAFT;
      video.multipart_upload_id = null;
      video.original_object_key = null;
      await manager.save(Video, video);

      return {
        id: video.id,
        publicId: video.public_id,
        status: VideoStatus.DRAFT,
      };
    });
  }

  async getVideoDetail(input: VideoDetailInput): Promise<VideoDetailResult> {
    const video = await this.findOwnedVideo(input.videoId, input.ownerUserId);
    const thumbnailUrl = video.thumbnail_object_key
      ? await this.storageService.presignStreamUrl({
          objectKey: video.thumbnail_object_key,
        })
      : null;

    return {
      id: video.id,
      publicId: video.public_id,
      status: video.status,
      originalFilename: video.original_filename,
      mimeType: video.mime_type,
      sizeBytes: this.parseNullableNumber(video.size_bytes),
      durationSeconds: this.parseNullableNumber(video.duration_seconds),
      thumbnailUrl: thumbnailUrl?.url ?? null,
      failureReason: video.failure_reason,
      createdAt: video.created_at,
      updatedAt: video.updated_at,
    };
  }

  async getStreamUrl(
    input: VideoAccessUrlInput,
  ): Promise<VideoStreamUrlResult> {
    const video = await this.findOwnedVideoByPublicId(
      input.publicId,
      input.ownerUserId,
    );
    this.assertReadyForAccess(video);

    const signed = await this.storageService.presignStreamUrl({
      objectKey: video.processed_object_key as string,
    });

    return {
      publicId: video.public_id,
      streamUrl: signed.url,
      expiresInSeconds: signed.expiresInSeconds,
    };
  }

  async getDownloadUrl(
    input: VideoAccessUrlInput,
  ): Promise<VideoDownloadUrlResult> {
    const video = await this.findOwnedVideoByPublicId(
      input.publicId,
      input.ownerUserId,
    );
    this.assertReadyForAccess(video);

    const filename = video.original_filename ?? `${video.public_id}.mp4`;
    const signed = await this.storageService.presignDownloadUrl({
      objectKey: video.processed_object_key as string,
      downloadFilename: filename,
    });

    return {
      publicId: video.public_id,
      downloadUrl: signed.url,
      expiresInSeconds: signed.expiresInSeconds,
      filename,
    };
  }

  private async findOwnedVideo(
    videoId: string,
    ownerUserId: string,
  ): Promise<Video> {
    const video = await this.videosRepository.findOne({
      where: { id: videoId },
      relations: { processing_jobs: true },
    });
    this.assertFoundAndOwned(video, ownerUserId);

    return video;
  }

  private async findOwnedVideoByPublicId(
    publicId: string,
    ownerUserId: string,
  ): Promise<Video> {
    const video = await this.videosRepository.findOne({
      where: { public_id: publicId },
    });
    this.assertFoundAndOwned(video, ownerUserId);

    return video;
  }

  private assertFoundAndOwned(
    video: Video | null,
    ownerUserId: string,
  ): asserts video is Video {
    if (!video) {
      throw new VideoNotFoundException();
    }
    if (video.owner_user_id !== ownerUserId) {
      throw new VideoNotOwnedException();
    }
  }

  private assertReadyForAccess(video: Video): void {
    if (video.status !== VideoStatus.READY || !video.processed_object_key) {
      throw new VideoNotReadyException();
    }
  }

  private assertUploadOpen(video: Video): void {
    if (
      video.status !== VideoStatus.UPLOADING ||
      !video.multipart_upload_id ||
      !video.original_object_key
    ) {
      throw new VideoUploadNotOpenException();
    }
  }

  private assertCompletable(video: Video): void {
    if (video.status === VideoStatus.PROCESSING) {
      const hasQueuedJob = video.processing_jobs.some(
        (job) => job.status === VideoProcessingJobStatus.QUEUED,
      );
      if (hasQueuedJob) {
        throw new VideoProcessingAlreadyEnqueuedException();
      }
    }

    this.assertUploadOpen(video);
  }

  private validateInitiateInput(input: InitiateVideoUploadInput): void {
    if (
      input.sizeBytes < 1 ||
      input.sizeBytes > VIDEO_UPLOAD_LIMITS.MAX_VIDEO_SIZE_BYTES
    ) {
      throw new InvalidVideoUploadPartsException('Invalid video size');
    }
    if (
      input.partCount < VIDEO_UPLOAD_LIMITS.MIN_MULTIPART_PART_NUMBER ||
      input.partCount > VIDEO_UPLOAD_LIMITS.MAX_MULTIPART_PART_NUMBER
    ) {
      throw new InvalidVideoUploadPartsException('Invalid upload part count');
    }
  }

  private validatePartNumbers(partNumbers: number[]): number[] {
    if (partNumbers.length === 0) {
      throw new InvalidVideoUploadPartsException('Upload parts are required');
    }

    const deduped = new Set<number>();
    for (const partNumber of partNumbers) {
      if (!Number.isInteger(partNumber)) {
        throw new InvalidVideoUploadPartsException(
          'Part numbers must be integers',
        );
      }
      if (
        partNumber < VIDEO_UPLOAD_LIMITS.MIN_MULTIPART_PART_NUMBER ||
        partNumber > VIDEO_UPLOAD_LIMITS.MAX_MULTIPART_PART_NUMBER
      ) {
        throw new InvalidVideoUploadPartsException(
          'Part number is out of range',
        );
      }
      if (deduped.has(partNumber)) {
        throw new InvalidVideoUploadPartsException(
          'Duplicate upload part number',
        );
      }
      deduped.add(partNumber);
    }

    return [...deduped].sort((a, b) => a - b);
  }

  private validateCompleteParts(
    parts: CompleteVideoUploadPartInput[],
  ): CompleteVideoUploadPartInput[] {
    const partNumbers = this.validatePartNumbers(
      parts.map((part) => part.partNumber),
    );
    const partsByNumber = new Map(
      parts.map((part) => [part.partNumber, part] as const),
    );

    return partNumbers.map((partNumber) => {
      const part = partsByNumber.get(
        partNumber,
      ) as CompleteVideoUploadPartInput;
      if (!part.eTag.trim()) {
        throw new InvalidVideoUploadPartsException(
          'Upload part ETag is required',
        );
      }
      return part;
    });
  }

  private calculatePartSize(sizeBytes: number, partCount: number): number {
    return Math.max(
      Math.ceil(sizeBytes / partCount),
      VIDEO_UPLOAD_LIMITS.MIN_MULTIPART_PART_SIZE_BYTES,
    );
  }

  private parseNullableNumber(value: string | null): number | null {
    return value === null ? null : Number(value);
  }
}
