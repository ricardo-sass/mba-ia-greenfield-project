import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { VerificationToken } from '../../auth/entities/verification-token.entity';
import { Channel } from '../../channels/entities/channel.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../../test/create-test-data-source';
import { User } from '../../users/entities/user.entity';
import { Video, VideoStatus } from './video.entity';
import { VideoProcessingJob } from './video-processing-job.entity';
import { VideoUploadPart } from './video-upload-part.entity';

const ALL_ENTITIES = [
  User,
  Channel,
  RefreshToken,
  VerificationToken,
  Video,
  VideoUploadPart,
  VideoProcessingJob,
];

describe('Video entity (integration)', () => {
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
  let videoRepository: Repository<Video>;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    videoRepository = dataSource.getRepository(Video);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  let counter = 0;
  async function createOwnerAndChannel(): Promise<{
    user: User;
    channel: Channel;
  }> {
    counter += 1;
    const user = await userRepository.save(
      userRepository.create({
        email: `video_owner_${counter}@example.com`,
        password: 'hashed',
      }),
    );
    const channel = await channelRepository.save(
      channelRepository.create({
        name: `Video Channel ${counter}`,
        nickname: `video-channel-${counter}`,
        user_id: user.id,
      }),
    );

    return { user, channel };
  }

  function buildVideo(
    user: User,
    channel: Channel,
    overrides: Partial<Video> = {},
  ): Partial<Video> {
    return {
      owner_user_id: user.id,
      channel_id: channel.id,
      public_id: `public-${counter}-${Date.now()}`,
      ...overrides,
    };
  }

  it('should persist a draft video with default status and nullable processing fields', async () => {
    const { user, channel } = await createOwnerAndChannel();

    const video = await videoRepository.save(
      videoRepository.create(buildVideo(user, channel)),
    );

    expect(video.id).toBeDefined();
    expect(video.status).toBe(VideoStatus.DRAFT);
    expect(video.title).toBeNull();
    expect(video.original_object_key).toBeNull();
    expect(video.processed_object_key).toBeNull();
    expect(video.thumbnail_object_key).toBeNull();
    expect(video.multipart_upload_id).toBeNull();
    expect(video.size_bytes).toBeNull();
    expect(video.duration_seconds).toBeNull();
    expect(video.metadata).toBeNull();
    expect(video.processing_attempts).toBe(0);
    expect(video.failure_reason).toBeNull();
    expect(video.created_at).toBeInstanceOf(Date);
    expect(video.updated_at).toBeInstanceOf(Date);
  });

  it('should enforce required owner, channel, and public_id constraints', async () => {
    await expect(
      videoRepository.save(videoRepository.create()),
    ).rejects.toThrow();
  });

  it('should enforce unique public_id constraint', async () => {
    const { user, channel } = await createOwnerAndChannel();

    await videoRepository.save(
      videoRepository.create(
        buildVideo(user, channel, { public_id: 'duplicate-public-id' }),
      ),
    );

    await expect(
      videoRepository.save(
        videoRepository.create(
          buildVideo(user, channel, { public_id: 'duplicate-public-id' }),
        ),
      ),
    ).rejects.toThrow();
  });

  it('should reject invalid status enum values', async () => {
    const { user, channel } = await createOwnerAndChannel();

    await expect(
      videoRepository.save(
        videoRepository.create(
          buildVideo(user, channel, {
            status: 'not-a-status' as VideoStatus,
          }),
        ),
      ),
    ).rejects.toThrow();
  });

  it('should enforce owner and channel foreign keys', async () => {
    const { user, channel } = await createOwnerAndChannel();

    await expect(
      videoRepository.save(
        videoRepository.create(
          buildVideo(user, channel, {
            owner_user_id: '00000000-0000-0000-0000-000000000000',
          }),
        ),
      ),
    ).rejects.toThrow();

    await expect(
      videoRepository.save(
        videoRepository.create(
          buildVideo(user, channel, {
            channel_id: '00000000-0000-0000-0000-000000000000',
          }),
        ),
      ),
    ).rejects.toThrow();
  });
});
