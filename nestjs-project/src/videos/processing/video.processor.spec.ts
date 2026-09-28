import type { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import {
  VideoProcessingJob,
  VideoProcessingJobStatus,
} from '../entities/video-processing-job.entity';
import { Video, VideoStatus } from '../entities/video.entity';
import { VIDEO_QUEUE_JOBS } from '../videos.constants';
import type { VideoProcessJobPayload } from '../videos.types';
import { VideoMediaProcessorService } from './video-media-processor.service';
import { VideoProcessor } from './video.processor';

function video(overrides: Partial<Video> = {}): Video {
  return {
    id: 'video-1',
    owner_user_id: 'owner-1',
    channel_id: 'channel-1',
    public_id: 'public-1',
    title: null,
    status: VideoStatus.PROCESSING,
    original_object_key: 'videos/raw/owner-1/video-1/clip.mp4',
    processed_object_key: null,
    thumbnail_object_key: null,
    multipart_upload_id: null,
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

function processingJob(
  overrides: Partial<VideoProcessingJob> = {},
): VideoProcessingJob {
  return {
    id: 'processing-job-1',
    video_id: 'video-1',
    bullmq_job_id: 'bull-job-1',
    status: VideoProcessingJobStatus.QUEUED,
    attempts_made: 0,
    last_error: null,
    created_at: new Date(),
    updated_at: new Date(),
    video: undefined as never,
    ...overrides,
  };
}

function job(overrides: Partial<Job<VideoProcessJobPayload>> = {}) {
  return {
    id: 'bull-job-1',
    name: VIDEO_QUEUE_JOBS.PROCESS,
    data: {
      videoId: 'video-1',
      originalObjectKey: 'videos/raw/owner-1/video-1/clip.mp4',
      attempt: 1,
    },
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides,
  } as Job<VideoProcessJobPayload>;
}

describe('VideoProcessor', () => {
  const manager = {
    save: jest.fn(),
    update: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn((callback) => callback(manager)),
  } as unknown as DataSource;
  const videosRepository = {
    findOneBy: jest.fn(),
  };
  const processingJobsRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const mediaProcessor = {
    process: jest.fn(),
  } as unknown as jest.Mocked<VideoMediaProcessorService>;

  let processor: VideoProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    videosRepository.findOneBy.mockResolvedValue(video());
    processingJobsRepository.findOne.mockResolvedValue(processingJob());
    mediaProcessor.process.mockResolvedValue({
      durationSeconds: 10.5,
      metadata: { format: { duration: '10.5' } },
      processedObjectKey: 'videos/processed/owner-1/video-1/clip.mp4',
      thumbnailObjectKey: 'videos/thumbnails/owner-1/video-1/clip.jpg',
    });
    processor = new VideoProcessor(
      dataSource,
      videosRepository as never,
      processingJobsRepository as never,
      mediaProcessor,
    );
  });

  it('transitions processing videos to ready with media metadata and object keys', async () => {
    await expect(processor.process(job())).resolves.toBeUndefined();

    expect(processingJobsRepository.update).toHaveBeenCalledWith(
      'processing-job-1',
      {
        status: VideoProcessingJobStatus.ACTIVE,
        attempts_made: 1,
      },
    );
    expect(manager.save).toHaveBeenCalledWith(Video, {
      id: 'video-1',
      status: VideoStatus.READY,
      duration_seconds: '10.500',
      metadata: { format: { duration: '10.5' } },
      processed_object_key: 'videos/processed/owner-1/video-1/clip.mp4',
      thumbnail_object_key: 'videos/thumbnails/owner-1/video-1/clip.jpg',
      processing_attempts: 1,
      failure_reason: null,
    });
    expect(manager.update).toHaveBeenCalledWith(
      VideoProcessingJob,
      'processing-job-1',
      {
        status: VideoProcessingJobStatus.COMPLETED,
        attempts_made: 1,
        last_error: null,
      },
    );
  });

  it('leaves already-ready videos unchanged for idempotent retries', async () => {
    videosRepository.findOneBy.mockResolvedValueOnce(
      video({ status: VideoStatus.READY }),
    );

    await expect(processor.process(job())).resolves.toBeUndefined();

    expect(mediaProcessor.process).not.toHaveBeenCalled();
    expect(processingJobsRepository.update).not.toHaveBeenCalled();
  });

  it('rethrows retryable processing errors while attempts remain', async () => {
    mediaProcessor.process.mockRejectedValueOnce(new Error('ffprobe failed'));

    await expect(processor.process(job())).rejects.toThrow('ffprobe failed');

    expect(processingJobsRepository.update).toHaveBeenLastCalledWith(
      'processing-job-1',
      {
        attempts_made: 1,
        last_error: 'ffprobe failed',
      },
    );
    expect(manager.update).not.toHaveBeenCalledWith(
      Video,
      'video-1',
      expect.objectContaining({ status: VideoStatus.FAILED }),
    );
  });

  it('marks video and processing job failed on the exhausted attempt', async () => {
    mediaProcessor.process.mockRejectedValueOnce(new Error('ffmpeg failed'));

    await expect(processor.process(job({ attemptsMade: 2 }))).rejects.toThrow(
      'ffmpeg failed',
    );

    expect(manager.update).toHaveBeenCalledWith(Video, 'video-1', {
      status: VideoStatus.FAILED,
      processing_attempts: 3,
      failure_reason: 'ffmpeg failed',
    });
    expect(manager.update).toHaveBeenCalledWith(
      VideoProcessingJob,
      'processing-job-1',
      {
        status: VideoProcessingJobStatus.FAILED,
        attempts_made: 3,
        last_error: 'ffmpeg failed',
      },
    );
  });
});
