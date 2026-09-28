import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Channel } from '../channels/entities/channel.entity';
import {
  InvalidVideoUploadPartsException,
  VideoNotOwnedException,
  VideoProcessingAlreadyEnqueuedException,
  VideoProcessingEnqueueFailedException,
  VideoUploadNotOpenException,
} from '../common/exceptions/domain.exception';
import {
  VideoProcessingJob,
  VideoProcessingJobStatus,
} from './entities/video-processing-job.entity';
import { Video, VideoStatus } from './entities/video.entity';
import { VideosStorageService } from './storage/videos-storage.service';
import { VideoObjectKeysService } from './video-object-keys.service';
import { VideoProcessingQueueService } from './video-processing-queue.service';
import { VideoPublicIdService } from './video-public-id.service';
import { VideosService } from './videos.service';

function video(overrides: Partial<Video> = {}): Video {
  return {
    id: 'video-1',
    owner_user_id: 'owner-1',
    channel_id: 'channel-1',
    public_id: 'public-1',
    title: null,
    status: VideoStatus.UPLOADING,
    original_object_key: 'videos/raw/owner-1/video-1/clip.mp4',
    processed_object_key: null,
    thumbnail_object_key: null,
    multipart_upload_id: 'upload-1',
    original_filename: 'clip.mp4',
    mime_type: 'video/mp4',
    size_bytes: '10485760',
    duration_seconds: null,
    metadata: null,
    processing_attempts: 0,
    failure_reason: null,
    created_at: new Date(),
    updated_at: new Date(),
    owner: undefined as never,
    channel: undefined as never,
    upload_parts: [],
    processing_jobs: [],
    ...overrides,
  };
}

describe('VideosService', () => {
  const manager = {
    findOne: jest.fn(),
    create: jest.fn((_: unknown, entity: unknown) => entity),
    save: jest.fn(async (_: unknown, entity: any) => ({
      id: entity.id ?? 'generated-id',
      ...entity,
    })),
    delete: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn((callback) => callback(manager)),
  };
  const videosRepository = {
    findOne: jest.fn(),
  };
  const processingJobsRepository = {
    update: jest.fn(),
  };
  const storageService = {
    initiateMultipartUpload: jest.fn(),
    presignUploadPart: jest.fn(),
    completeMultipartUpload: jest.fn(),
    abortMultipartUpload: jest.fn(),
  };
  const objectKeysService = {
    raw: jest.fn(),
  };
  const publicIdService = {
    createWithUniquePublicId: jest.fn(),
  };
  const processingQueueService = {
    enqueueProcessJob: jest.fn(),
  };

  let service: VideosService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        VideosService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Video), useValue: videosRepository },
        {
          provide: getRepositoryToken(VideoProcessingJob),
          useValue: processingJobsRepository,
        },
        { provide: VideosStorageService, useValue: storageService },
        { provide: VideoObjectKeysService, useValue: objectKeysService },
        { provide: VideoPublicIdService, useValue: publicIdService },
        {
          provide: VideoProcessingQueueService,
          useValue: processingQueueService,
        },
      ],
    }).compile();

    service = module.get(VideosService);
    manager.findOne.mockResolvedValue({ id: 'channel-1' } as Channel);
    publicIdService.createWithUniquePublicId.mockImplementation(
      async (persist: (publicId: string) => Promise<Video>) =>
        persist('public-1'),
    );
    objectKeysService.raw.mockReturnValue(
      'videos/raw/owner-1/generated-id/clip.mp4',
    );
    storageService.initiateMultipartUpload.mockResolvedValue({
      objectKey: 'videos/raw/owner-1/generated-id/clip.mp4',
      uploadId: 'upload-1',
    });
    storageService.presignUploadPart.mockResolvedValue({
      url: 'http://signed-part',
      expiresInSeconds: 900,
    });
    storageService.completeMultipartUpload.mockResolvedValue(undefined);
    storageService.abortMultipartUpload.mockResolvedValue(undefined);
    processingQueueService.enqueueProcessJob.mockResolvedValue('bull-job-1');
    processingJobsRepository.update.mockResolvedValue({ affected: 1 } as never);
  });

  it('initiates an upload for an owned channel and stores multipart metadata', async () => {
    await expect(
      service.initiateUpload({
        ownerUserId: 'owner-1',
        channelId: 'channel-1',
        originalFilename: 'clip.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 10 * 1024 * 1024,
        partCount: 2,
      }),
    ).resolves.toEqual({
      id: 'generated-id',
      publicId: 'public-1',
      status: VideoStatus.UPLOADING,
      multipartUploadId: 'upload-1',
      objectKey: 'videos/raw/owner-1/generated-id/clip.mp4',
      partSizeBytes: 5 * 1024 * 1024,
    });

    expect(manager.findOne).toHaveBeenCalledWith(Channel, {
      where: { id: 'channel-1', user_id: 'owner-1' },
    });
    expect(storageService.initiateMultipartUpload).toHaveBeenCalledWith({
      objectKey: 'videos/raw/owner-1/generated-id/clip.mp4',
      contentType: 'video/mp4',
      metadata: {
        ownerUserId: 'owner-1',
        videoId: 'generated-id',
      },
    });
  });

  it('rejects upload initiation when the channel does not belong to the owner', async () => {
    manager.findOne.mockResolvedValueOnce(null);

    await expect(
      service.initiateUpload({
        ownerUserId: 'owner-1',
        channelId: 'channel-1',
        originalFilename: 'clip.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 10,
        partCount: 1,
      }),
    ).rejects.toThrow(VideoNotOwnedException);
  });

  it('signs deduped sorted upload parts only for the owner and open upload', async () => {
    videosRepository.findOne.mockResolvedValueOnce(video());

    await expect(
      service.signUploadParts({
        ownerUserId: 'owner-1',
        videoId: 'video-1',
        partNumbers: [2, 1],
      }),
    ).resolves.toEqual({
      videoId: 'video-1',
      expiresInSeconds: 900,
      parts: [
        { partNumber: 1, uploadUrl: 'http://signed-part' },
        { partNumber: 2, uploadUrl: 'http://signed-part' },
      ],
    });
  });

  it('rejects duplicate upload part numbers', async () => {
    videosRepository.findOne.mockResolvedValueOnce(video());

    await expect(
      service.signUploadParts({
        ownerUserId: 'owner-1',
        videoId: 'video-1',
        partNumbers: [1, 1],
      }),
    ).rejects.toThrow(InvalidVideoUploadPartsException);
  });

  it('rejects signing for another user', async () => {
    videosRepository.findOne.mockResolvedValueOnce(video());

    await expect(
      service.signUploadParts({
        ownerUserId: 'other-owner',
        videoId: 'video-1',
        partNumbers: [1],
      }),
    ).rejects.toThrow(VideoNotOwnedException);
  });

  it('completes an upload, enqueues processing, and copies the BullMQ job id', async () => {
    manager.findOne.mockResolvedValueOnce(video());
    manager.save.mockImplementation(
      async (entityClass: unknown, entity: any) => {
        if (entityClass === VideoProcessingJob) {
          return { id: 'processing-job-1', ...entity };
        }
        return { id: entity.id ?? 'generated-id', ...entity };
      },
    );

    await expect(
      service.completeUpload({
        ownerUserId: 'owner-1',
        videoId: 'video-1',
        parts: [
          { partNumber: 2, eTag: '"etag-2"' },
          { partNumber: 1, eTag: '"etag-1"' },
        ],
      }),
    ).resolves.toEqual({
      id: 'video-1',
      publicId: 'public-1',
      status: VideoStatus.PROCESSING,
      processingJobId: 'processing-job-1',
    });

    expect(storageService.completeMultipartUpload).toHaveBeenCalledWith({
      objectKey: 'videos/raw/owner-1/video-1/clip.mp4',
      uploadId: 'upload-1',
      parts: [
        { partNumber: 1, eTag: '"etag-1"' },
        { partNumber: 2, eTag: '"etag-2"' },
      ],
    });
    expect(processingQueueService.enqueueProcessJob).toHaveBeenCalledWith({
      videoId: 'video-1',
      originalObjectKey: 'videos/raw/owner-1/video-1/clip.mp4',
      attempt: 1,
    });
    expect(processingJobsRepository.update).toHaveBeenCalledWith(
      'processing-job-1',
      { bullmq_job_id: 'bull-job-1' },
    );
  });

  it('maps enqueue failures after completion', async () => {
    manager.findOne.mockResolvedValueOnce(video());
    manager.save.mockImplementation(
      async (entityClass: unknown, entity: any) => {
        if (entityClass === VideoProcessingJob) {
          return { id: 'processing-job-1', ...entity };
        }
        return { id: entity.id ?? 'generated-id', ...entity };
      },
    );
    processingQueueService.enqueueProcessJob.mockRejectedValueOnce(
      new Error('redis down'),
    );

    await expect(
      service.completeUpload({
        ownerUserId: 'owner-1',
        videoId: 'video-1',
        parts: [{ partNumber: 1, eTag: '"etag-1"' }],
      }),
    ).rejects.toThrow(VideoProcessingEnqueueFailedException);
  });

  it('rejects completion when processing has already been enqueued', async () => {
    manager.findOne.mockResolvedValueOnce(
      video({
        status: VideoStatus.PROCESSING,
        multipart_upload_id: null,
        processing_jobs: [
          {
            status: VideoProcessingJobStatus.QUEUED,
          } as VideoProcessingJob,
        ],
      }),
    );

    await expect(
      service.completeUpload({
        ownerUserId: 'owner-1',
        videoId: 'video-1',
        parts: [{ partNumber: 1, eTag: '"etag-1"' }],
      }),
    ).rejects.toThrow(VideoProcessingAlreadyEnqueuedException);
  });

  it('aborts an open upload and returns the video to draft', async () => {
    videosRepository.findOne.mockResolvedValueOnce(video());

    await expect(
      service.abortUpload({
        ownerUserId: 'owner-1',
        videoId: 'video-1',
      }),
    ).resolves.toEqual({
      id: 'video-1',
      publicId: 'public-1',
      status: VideoStatus.DRAFT,
    });

    expect(storageService.abortMultipartUpload).toHaveBeenCalledWith({
      objectKey: 'videos/raw/owner-1/video-1/clip.mp4',
      uploadId: 'upload-1',
    });
  });

  it('rejects abort when upload is no longer open', async () => {
    videosRepository.findOne.mockResolvedValueOnce(
      video({ status: VideoStatus.PROCESSING }),
    );

    await expect(
      service.abortUpload({
        ownerUserId: 'owner-1',
        videoId: 'video-1',
      }),
    ).rejects.toThrow(VideoUploadNotOpenException);
  });
});
