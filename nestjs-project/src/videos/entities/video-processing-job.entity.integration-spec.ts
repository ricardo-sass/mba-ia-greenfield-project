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
} from './video-processing-job.entity';
import { VideoUploadPart } from './video-upload-part.entity';
import { Video } from './video.entity';

const ALL_ENTITIES = [
  User,
  Channel,
  RefreshToken,
  VerificationToken,
  Video,
  VideoUploadPart,
  VideoProcessingJob,
];

describe('VideoProcessingJob entity (integration)', () => {
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
  let videoRepository: Repository<Video>;
  let jobRepository: Repository<VideoProcessingJob>;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    videoRepository = dataSource.getRepository(Video);
    jobRepository = dataSource.getRepository(VideoProcessingJob);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  let counter = 0;
  async function createVideo(): Promise<Video> {
    counter += 1;
    const user = await userRepository.save(
      userRepository.create({
        email: `job_owner_${counter}@example.com`,
        password: 'hashed',
      }),
    );
    const channel = await channelRepository.save(
      channelRepository.create({
        name: `Job Channel ${counter}`,
        nickname: `job-channel-${counter}`,
        user_id: user.id,
      }),
    );

    return videoRepository.save(
      videoRepository.create({
        owner_user_id: user.id,
        channel_id: channel.id,
        public_id: `job-public-${counter}`,
      }),
    );
  }

  it('should default status and attempts for queued processing jobs', async () => {
    const video = await createVideo();

    const job = await jobRepository.save(
      jobRepository.create({ video_id: video.id }),
    );

    expect(job.status).toBe(VideoProcessingJobStatus.QUEUED);
    expect(job.attempts_made).toBe(0);
    expect(job.bullmq_job_id).toBeNull();
    expect(job.last_error).toBeNull();
    expect(job.created_at).toBeInstanceOf(Date);
    expect(job.updated_at).toBeInstanceOf(Date);
  });

  it('should enforce unique bullmq_job_id when present', async () => {
    const firstVideo = await createVideo();
    const secondVideo = await createVideo();

    await jobRepository.save(
      jobRepository.create({
        video_id: firstVideo.id,
        bullmq_job_id: 'bull-job-1',
      }),
    );

    await expect(
      jobRepository.save(
        jobRepository.create({
          video_id: secondVideo.id,
          bullmq_job_id: 'bull-job-1',
        }),
      ),
    ).rejects.toThrow();
  });

  it('should allow multiple jobs without a bullmq_job_id before enqueue acknowledgement', async () => {
    const firstVideo = await createVideo();
    const secondVideo = await createVideo();

    await jobRepository.save(jobRepository.create({ video_id: firstVideo.id }));
    await jobRepository.save(
      jobRepository.create({ video_id: secondVideo.id }),
    );

    await expect(jobRepository.count()).resolves.toBe(2);
  });
});
