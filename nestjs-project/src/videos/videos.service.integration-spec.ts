import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Channel } from '../channels/entities/channel.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { VideoProcessingJob } from './entities/video-processing-job.entity';
import { VideoUploadPart } from './entities/video-upload-part.entity';
import { Video, VideoStatus } from './entities/video.entity';
import { VideosStorageService } from './storage/videos-storage.service';
import { VideoObjectKeysService } from './video-object-keys.service';
import { VideoProcessingQueueService } from './video-processing-queue.service';
import { VideoPublicIdService } from './video-public-id.service';
import { VideosService } from './videos.service';

const ALL_ENTITIES = [
  User,
  Channel,
  RefreshToken,
  VerificationToken,
  Video,
  VideoUploadPart,
  VideoProcessingJob,
];

describe('VideosService (integration)', () => {
  let dataSource: DataSource;
  let service: VideosService;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
  let videoRepository: Repository<Video>;
  let uploadPartRepository: Repository<VideoUploadPart>;
  let processingJobRepository: Repository<VideoProcessingJob>;

  const storageService = {
    initiateMultipartUpload: jest.fn(),
    presignUploadPart: jest.fn(),
    completeMultipartUpload: jest.fn(),
    abortMultipartUpload: jest.fn(),
  } as unknown as jest.Mocked<VideosStorageService>;
  const queueService = {
    enqueueProcessJob: jest.fn(),
  } as unknown as jest.Mocked<VideoProcessingQueueService>;
  const publicIdService = {
    createWithUniquePublicId: jest.fn(
      async <T>(persist: (publicId: string) => Promise<T>) =>
        persist(`public-${Date.now()}`),
    ),
  } as unknown as VideoPublicIdService;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    videoRepository = dataSource.getRepository(Video);
    uploadPartRepository = dataSource.getRepository(VideoUploadPart);
    processingJobRepository = dataSource.getRepository(VideoProcessingJob);
    service = new VideosService(
      dataSource,
      videoRepository,
      processingJobRepository,
      storageService,
      new VideoObjectKeysService(),
      publicIdService,
      queueService,
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await cleanAllTables(dataSource);
    storageService.completeMultipartUpload.mockResolvedValue(undefined);
    queueService.enqueueProcessJob.mockResolvedValue('bull-job-1');
  });

  async function createOwnerChannel(): Promise<{
    user: User;
    channel: Channel;
  }> {
    const user = await userRepository.save(
      userRepository.create({
        email: `video-${Date.now()}@example.com`,
        password: 'hash',
      }),
    );
    const channel = await channelRepository.save(
      channelRepository.create({
        name: 'Video Channel',
        nickname: `video_${Date.now()}`,
        user_id: user.id,
      }),
    );

    return { user, channel };
  }

  async function createOpenUpload(): Promise<Video> {
    const { user, channel } = await createOwnerChannel();

    return videoRepository.save(
      videoRepository.create({
        owner_user_id: user.id,
        channel_id: channel.id,
        public_id: `public_${Date.now()}`,
        status: VideoStatus.DRAFT,
        original_object_key: `videos/raw/${user.id}/video-1/clip.mp4`,
        multipart_upload_id: 'upload-1',
        original_filename: 'clip.mp4',
        mime_type: 'video/mp4',
        size_bytes: String(10 * 1024 * 1024),
      }),
    );
  }

  it('persists upload parts, processing transition, processing job, and BullMQ id', async () => {
    const video = await createOpenUpload();

    const result = await service.completeUpload({
      ownerUserId: video.owner_user_id,
      videoId: video.id,
      parts: [
        { partNumber: 1, eTag: '"etag-1"' },
        { partNumber: 2, eTag: '"etag-2"', sizeBytes: 5 },
      ],
    });

    expect(result.status).toBe(VideoStatus.PROCESSING);

    const persistedVideo = await videoRepository.findOneByOrFail({
      id: video.id,
    });
    expect(persistedVideo.status).toBe(VideoStatus.PROCESSING);
    expect(persistedVideo.multipart_upload_id).toBeNull();

    await expect(
      uploadPartRepository.find({
        where: { video_id: video.id },
        order: { part_number: 'ASC' },
      }),
    ).resolves.toMatchObject([
      { part_number: 1, etag: '"etag-1"' },
      { part_number: 2, etag: '"etag-2"', size_bytes: '5' },
    ]);

    const jobs = await processingJobRepository.findBy({ video_id: video.id });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].bullmq_job_id).toBe('bull-job-1');
    expect(queueService.enqueueProcessJob).toHaveBeenCalledWith({
      videoId: video.id,
      originalObjectKey: video.original_object_key,
      attempt: 1,
    });
  });

  it('rolls back persisted parts and status when storage completion fails', async () => {
    const video = await createOpenUpload();
    storageService.completeMultipartUpload.mockRejectedValueOnce(
      new Error('complete failed'),
    );

    await expect(
      service.completeUpload({
        ownerUserId: video.owner_user_id,
        videoId: video.id,
        parts: [{ partNumber: 1, eTag: '"etag-1"' }],
      }),
    ).rejects.toThrow('complete failed');

    await expect(
      videoRepository.findOneByOrFail({ id: video.id }),
    ).resolves.toMatchObject({
      status: VideoStatus.DRAFT,
      multipart_upload_id: 'upload-1',
    });
    await expect(
      uploadPartRepository.countBy({ video_id: video.id }),
    ).resolves.toBe(0);
    await expect(
      processingJobRepository.countBy({ video_id: video.id }),
    ).resolves.toBe(0);
    expect(queueService.enqueueProcessJob).not.toHaveBeenCalled();
  });

  it('marks video and processing job failed when queue enqueue fails', async () => {
    const video = await createOpenUpload();
    queueService.enqueueProcessJob.mockRejectedValueOnce(
      new Error('redis down'),
    );

    await expect(
      service.completeUpload({
        ownerUserId: video.owner_user_id,
        videoId: video.id,
        parts: [{ partNumber: 1, eTag: '"etag-1"' }],
      }),
    ).rejects.toThrow('Failed to enqueue video processing');

    await expect(
      videoRepository.findOneByOrFail({ id: video.id }),
    ).resolves.toMatchObject({
      status: VideoStatus.FAILED,
      failure_reason: 'Failed to enqueue video processing job',
    });

    const job = await processingJobRepository.findOneByOrFail({
      video_id: video.id,
    });
    expect(job).toMatchObject({
      status: 'failed',
      last_error: 'Failed to enqueue video processing job',
      bullmq_job_id: null,
    });
  });
});
