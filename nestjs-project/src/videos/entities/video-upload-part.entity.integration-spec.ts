import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { VerificationToken } from '../../auth/entities/verification-token.entity';
import { Channel } from '../../channels/entities/channel.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../../test/create-test-data-source';
import { User } from '../../users/entities/user.entity';
import { VideoProcessingJob } from './video-processing-job.entity';
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

describe('VideoUploadPart entity (integration)', () => {
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
  let videoRepository: Repository<Video>;
  let partRepository: Repository<VideoUploadPart>;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    videoRepository = dataSource.getRepository(Video);
    partRepository = dataSource.getRepository(VideoUploadPart);
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
        email: `part_owner_${counter}@example.com`,
        password: 'hashed',
      }),
    );
    const channel = await channelRepository.save(
      channelRepository.create({
        name: `Part Channel ${counter}`,
        nickname: `part-channel-${counter}`,
        user_id: user.id,
      }),
    );

    return videoRepository.save(
      videoRepository.create({
        owner_user_id: user.id,
        channel_id: channel.id,
        public_id: `part-public-${counter}`,
      }),
    );
  }

  it('should enforce unique part number per video', async () => {
    const video = await createVideo();

    await partRepository.save(
      partRepository.create({
        video_id: video.id,
        part_number: 1,
        etag: 'etag-1',
      }),
    );

    await expect(
      partRepository.save(
        partRepository.create({
          video_id: video.id,
          part_number: 1,
          etag: 'etag-duplicate',
        }),
      ),
    ).rejects.toThrow();
  });

  it('should allow the same part number for different videos', async () => {
    const firstVideo = await createVideo();
    const secondVideo = await createVideo();

    await partRepository.save(
      partRepository.create({
        video_id: firstVideo.id,
        part_number: 1,
        etag: 'etag-1',
      }),
    );
    await partRepository.save(
      partRepository.create({
        video_id: secondVideo.id,
        part_number: 1,
        etag: 'etag-2',
      }),
    );

    await expect(partRepository.count()).resolves.toBe(2);
  });

  it('should cascade delete parts when the video is deleted', async () => {
    const video = await createVideo();
    await partRepository.save(
      partRepository.create({
        video_id: video.id,
        part_number: 1,
        etag: 'etag-1',
        size_bytes: '5242880',
      }),
    );

    await videoRepository.delete({ id: video.id });

    await expect(partRepository.count()).resolves.toBe(0);
  });
});
