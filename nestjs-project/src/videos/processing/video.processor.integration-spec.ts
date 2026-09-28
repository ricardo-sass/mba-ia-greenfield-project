import type { Job } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { VerificationToken } from '../../auth/entities/verification-token.entity';
import { Channel } from '../../channels/entities/channel.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../../test/create-test-data-source';
import { User } from '../../users/entities/user.entity';
import {
  VideoProcessingJob,
  VideoProcessingJobStatus,
} from '../entities/video-processing-job.entity';
import { VideoUploadPart } from '../entities/video-upload-part.entity';
import { Video, VideoStatus } from '../entities/video.entity';
import { VIDEO_QUEUE_JOBS } from '../videos.constants';
import type { VideoProcessJobPayload } from '../videos.types';
import { VideoMediaProcessorService } from './video-media-processor.service';
import { VideoProcessor } from './video.processor';

const ALL_ENTITIES = [
  User,
  Channel,
  RefreshToken,
  VerificationToken,
  Video,
  VideoUploadPart,
  VideoProcessingJob,
];

function bullJob(
  videoId: string,
  attemptsMade = 0,
): Job<VideoProcessJobPayload> {
  return {
    id: 'bull-job-1',
    name: VIDEO_QUEUE_JOBS.PROCESS,
    data: {
      videoId,
      originalObjectKey: `videos/raw/owner/${videoId}/clip.mp4`,
      attempt: attemptsMade + 1,
    },
    attemptsMade,
    opts: { attempts: 3 },
  } as Job<VideoProcessJobPayload>;
}

describe('VideoProcessor (integration)', () => {
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
  let videoRepository: Repository<Video>;
  let processingJobRepository: Repository<VideoProcessingJob>;
  let processor: VideoProcessor;

  const mediaProcessor = {
    process: jest.fn(),
  } as unknown as jest.Mocked<VideoMediaProcessorService>;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    videoRepository = dataSource.getRepository(Video);
    processingJobRepository = dataSource.getRepository(VideoProcessingJob);
    processor = new VideoProcessor(
      dataSource,
      videoRepository,
      processingJobRepository,
      mediaProcessor,
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await cleanAllTables(dataSource);
    mediaProcessor.process.mockResolvedValue({
      durationSeconds: 42.25,
      metadata: { format: { duration: '42.25' } },
      processedObjectKey: 'videos/processed/owner/video-1/clip.mp4',
      thumbnailObjectKey: 'videos/thumbnails/owner/video-1/clip.jpg',
    });
  });

  async function createProcessingVideo(): Promise<Video> {
    const user = await userRepository.save(
      userRepository.create({
        email: `worker-${Date.now()}@example.com`,
        password: 'hash',
      }),
    );
    const channel = await channelRepository.save(
      channelRepository.create({
        name: 'Worker Channel',
        nickname: `worker_${Date.now()}`,
        user_id: user.id,
      }),
    );
    const video = await videoRepository.save(
      videoRepository.create({
        owner_user_id: user.id,
        channel_id: channel.id,
        public_id: `worker_${Date.now()}`,
        status: VideoStatus.PROCESSING,
        original_object_key: `videos/raw/${user.id}/video-1/clip.mp4`,
        original_filename: 'clip.mp4',
        mime_type: 'video/mp4',
        size_bytes: String(10 * 1024 * 1024),
      }),
    );
    await processingJobRepository.save(
      processingJobRepository.create({
        video_id: video.id,
        bullmq_job_id: 'bull-job-1',
        status: VideoProcessingJobStatus.QUEUED,
      }),
    );

    return video;
  }

  it('persists ready status, media metadata, object keys, and completed job state', async () => {
    const video = await createProcessingVideo();

    await processor.process(bullJob(video.id));

    await expect(
      videoRepository.findOneByOrFail({ id: video.id }),
    ).resolves.toMatchObject({
      status: VideoStatus.READY,
      duration_seconds: '42.250',
      metadata: { format: { duration: '42.25' } },
      processed_object_key: 'videos/processed/owner/video-1/clip.mp4',
      thumbnail_object_key: 'videos/thumbnails/owner/video-1/clip.jpg',
      processing_attempts: 1,
      failure_reason: null,
    });
    await expect(
      processingJobRepository.findOneByOrFail({ video_id: video.id }),
    ).resolves.toMatchObject({
      status: VideoProcessingJobStatus.COMPLETED,
      attempts_made: 1,
      last_error: null,
    });
  });

  it('persists failed status and job error when attempts are exhausted', async () => {
    const video = await createProcessingVideo();
    mediaProcessor.process.mockRejectedValueOnce(new Error('media invalid'));

    await expect(processor.process(bullJob(video.id, 2))).rejects.toThrow(
      'media invalid',
    );

    await expect(
      videoRepository.findOneByOrFail({ id: video.id }),
    ).resolves.toMatchObject({
      status: VideoStatus.FAILED,
      processing_attempts: 3,
      failure_reason: 'media invalid',
    });
    await expect(
      processingJobRepository.findOneByOrFail({ video_id: video.id }),
    ).resolves.toMatchObject({
      status: VideoProcessingJobStatus.FAILED,
      attempts_made: 3,
      last_error: 'media invalid',
    });
  });
});
