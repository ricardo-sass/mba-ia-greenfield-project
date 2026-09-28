import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { Channel } from '../src/channels/entities/channel.entity';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { cleanAllTables } from '../src/test/create-test-data-source';
import { User } from '../src/users/entities/user.entity';
import {
  VideoProcessingJob,
  VideoProcessingJobStatus,
} from '../src/videos/entities/video-processing-job.entity';
import { Video, VideoStatus } from '../src/videos/entities/video.entity';
import { VideosStorageService } from '../src/videos/storage/videos-storage.service';
import { VideoProcessingQueueService } from '../src/videos/video-processing-queue.service';
import { VideoPublicIdService } from '../src/videos/video-public-id.service';

describe('videos', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
  let videoRepository: Repository<Video>;
  let processingJobRepository: Repository<VideoProcessingJob>;
  let throttlerStorage: ThrottlerStorageService;

  const storageService = {
    initiateMultipartUpload: jest.fn(),
    presignUploadPart: jest.fn(),
    completeMultipartUpload: jest.fn(),
    abortMultipartUpload: jest.fn(),
    presignStreamUrl: jest.fn(),
    presignDownloadUrl: jest.fn(),
  } as unknown as jest.Mocked<VideosStorageService>;

  const queueService = {
    enqueueProcessJob: jest.fn(),
  } as unknown as jest.Mocked<VideoProcessingQueueService>;

  const publicIdService = {
    createWithUniquePublicId: jest.fn(
      async <T>(persist: (publicId: string) => Promise<T>) =>
        persist(nextPublicId()),
    ),
  } as unknown as jest.Mocked<VideoPublicIdService>;

  let publicIdSequence = 0;

  function nextPublicId(): string {
    publicIdSequence += 1;
    return `public_${Date.now().toString(36)}_${publicIdSequence.toString(36)}`;
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(VideosStorageService)
      .useValue(storageService)
      .overrideProvider(VideoProcessingQueueService)
      .useValue(queueService)
      .overrideProvider(VideoPublicIdService)
      .useValue(publicIdService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(
      new DomainExceptionFilter(),
      new ValidationExceptionFilter(),
    );
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    videoRepository = dataSource.getRepository(Video);
    processingJobRepository = dataSource.getRepository(VideoProcessingJob);
    throttlerStorage =
      moduleFixture.get<ThrottlerStorageService>(ThrottlerStorage);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await cleanAllTables(dataSource);
    throttlerStorage.storage.clear();
    storageService.initiateMultipartUpload.mockImplementation(
      async (input) => ({
        objectKey: input.objectKey,
        uploadId: 'upload-1',
      }),
    );
    storageService.presignUploadPart.mockImplementation(async (input) => ({
      url: `https://storage.local/${input.objectKey}?partNumber=${input.partNumber}`,
      expiresInSeconds: 900,
    }));
    storageService.completeMultipartUpload.mockResolvedValue(undefined);
    storageService.abortMultipartUpload.mockResolvedValue(undefined);
    storageService.presignStreamUrl.mockImplementation(async (input) => ({
      url: `https://storage.local/${input.objectKey}`,
      expiresInSeconds: 600,
    }));
    storageService.presignDownloadUrl.mockImplementation(async (input) => ({
      url: `https://storage.local/${input.objectKey}?download=1`,
      expiresInSeconds: 600,
    }));
    queueService.enqueueProcessJob.mockResolvedValue('bull-job-1');
    publicIdService.createWithUniquePublicId.mockImplementation(
      async <T>(persist: (publicId: string) => Promise<T>) =>
        persist(nextPublicId()),
    );
  });

  async function captureConfirmationToken(
    email: string,
    password = 'password123',
  ): Promise<string> {
    const authService = app.get(AuthService);
    const mailServiceInstance = (authService as any).mailService;
    let capturedToken = '';
    jest
      .spyOn(mailServiceInstance, 'sendConfirmationEmail')
      .mockImplementationOnce(async (_e: string, _n: string, token: string) => {
        capturedToken = token;
      });

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);

    return capturedToken;
  }

  async function registerConfirmAndLogin(email: string): Promise<{
    accessToken: string;
    user: User;
    channel: Channel;
  }> {
    const token = await captureConfirmationToken(email);
    await request(app.getHttpServer())
      .get('/auth/confirm-email')
      .query({ token })
      .expect(204);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);

    const user = await userRepository.findOneByOrFail({ email });
    const channel = await channelRepository.findOneByOrFail({
      user_id: user.id,
    });

    return {
      accessToken: login.body.access_token,
      user,
      channel,
    };
  }

  async function createOpenUpload(owner: {
    user: User;
    channel: Channel;
  }): Promise<Video> {
    return videoRepository.save(
      videoRepository.create({
        owner_user_id: owner.user.id,
        channel_id: owner.channel.id,
        public_id: nextPublicId(),
        status: VideoStatus.UPLOADING,
        original_object_key: `videos/raw/${owner.user.id}/video-1/clip.mp4`,
        multipart_upload_id: 'upload-1',
        original_filename: 'clip.mp4',
        mime_type: 'video/mp4',
        size_bytes: String(10 * 1024 * 1024),
      }),
    );
  }

  async function createVideo(
    owner: {
      user: User;
      channel: Channel;
    },
    overrides: Partial<Video>,
  ): Promise<Video> {
    return videoRepository.save(
      videoRepository.create({
        owner_user_id: owner.user.id,
        channel_id: owner.channel.id,
        public_id: nextPublicId(),
        status: VideoStatus.DRAFT,
        original_filename: 'clip.mp4',
        mime_type: 'video/mp4',
        size_bytes: String(10 * 1024 * 1024),
        ...overrides,
      }),
    );
  }

  // API Contracts - Multipart Upload Endpoints
  test('initiate-valid-upload-returns-uploading-draft', async () => {
    const { accessToken, user } = await registerConfirmAndLogin(
      'video-owner@example.com',
    );

    const response = await request(app.getHttpServer())
      .post('/videos/uploads')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        original_filename: 'clip.mp4',
        mime_type: 'video/mp4',
        size_bytes: 10 * 1024 * 1024,
        part_count: 2,
      })
      .expect(201);

    expect(response.body).toMatchObject({
      status: 'uploading',
      multipart_upload_id: 'upload-1',
      part_size_bytes: 5 * 1024 * 1024,
    });
    expect(response.body.id).toBeDefined();
    expect(response.body.public_id).toBeDefined();
    expect(response.body.object_key).toContain(response.body.id);

    const persisted = await videoRepository.findOneByOrFail({
      id: response.body.id,
    });
    expect(persisted.owner_user_id).toBe(user.id);
    expect(persisted.status).toBe(VideoStatus.UPLOADING);
    expect(persisted.multipart_upload_id).toBe('upload-1');
  });

  test('reject-upload-above-ten-gigabytes', async () => {
    const { accessToken } = await registerConfirmAndLogin(
      'video-size@example.com',
    );

    const response = await request(app.getHttpServer())
      .post('/videos/uploads')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        original_filename: 'too-large.mp4',
        mime_type: 'video/mp4',
        size_bytes: 10 * 1024 * 1024 * 1024 + 1,
        part_count: 2,
      })
      .expect(400);

    expect(response.body.error).toBe('VALIDATION_ERROR');
    await expect(videoRepository.count()).resolves.toBe(0);
  });

  test('deny-part-signing-for-non-owner', async () => {
    const owner = await registerConfirmAndLogin('video-owner-a@example.com');
    const nonOwner = await registerConfirmAndLogin('video-owner-b@example.com');
    const video = await createOpenUpload(owner);

    const response = await request(app.getHttpServer())
      .post(`/videos/${video.id}/upload-parts/sign`)
      .set('Authorization', `Bearer ${nonOwner.accessToken}`)
      .send({ part_numbers: [1, 2] })
      .expect(403);

    expect(response.body.error).toBe('VIDEO_NOT_OWNED');
    expect(storageService.presignUploadPart).not.toHaveBeenCalled();
  });

  test('complete-valid-upload-enqueues-processing', async () => {
    const owner = await registerConfirmAndLogin('video-complete@example.com');
    const video = await createOpenUpload(owner);

    const response = await request(app.getHttpServer())
      .post(`/videos/${video.id}/upload-complete`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ parts: [{ part_number: 1, etag: '"etag-1"' }] })
      .expect(202);

    expect(response.body).toMatchObject({
      id: video.id,
      public_id: video.public_id,
      status: 'processing',
    });
    expect(response.body.processing_job_id).toBeDefined();

    const persisted = await videoRepository.findOneByOrFail({ id: video.id });
    expect(persisted.status).toBe(VideoStatus.PROCESSING);
    const job = await processingJobRepository.findOneByOrFail({
      video_id: video.id,
    });
    expect(job.status).toBe(VideoProcessingJobStatus.QUEUED);
    expect(job.bullmq_job_id).toBe('bull-job-1');
  });

  test('abort-open-upload-returns-no-content', async () => {
    const owner = await registerConfirmAndLogin('video-abort@example.com');
    const video = await createOpenUpload(owner);

    await request(app.getHttpServer())
      .delete(`/videos/${video.id}/upload`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(204)
      .expect('');

    expect(storageService.abortMultipartUpload).toHaveBeenCalledWith({
      objectKey: video.original_object_key,
      uploadId: video.multipart_upload_id,
    });

    const persisted = await videoRepository.findOneByOrFail({ id: video.id });
    expect(persisted.status).toBe(VideoStatus.DRAFT);
    expect(persisted.multipart_upload_id).toBeNull();
  });

  // API Contracts - Video Detail And Access URLs
  test('owner-gets-video-detail', async () => {
    const owner = await registerConfirmAndLogin('video-detail@example.com');
    const video = await createVideo(owner, {
      status: VideoStatus.READY,
      duration_seconds: '123.456',
      thumbnail_object_key: null,
      failure_reason: null,
    });

    const response = await request(app.getHttpServer())
      .get(`/videos/${video.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: video.id,
      public_id: video.public_id,
      status: 'ready',
      original_filename: 'clip.mp4',
      mime_type: 'video/mp4',
      size_bytes: 10 * 1024 * 1024,
      duration_seconds: 123.456,
      thumbnail_url: null,
      failure_reason: null,
    });
    expect(response.body.created_at).toBeDefined();
    expect(response.body.updated_at).toBeDefined();
  });

  test('deny-detail-for-non-owner', async () => {
    const owner = await registerConfirmAndLogin(
      'video-detail-owner@example.com',
    );
    const nonOwner = await registerConfirmAndLogin(
      'video-detail-other@example.com',
    );
    const video = await createVideo(owner, {
      status: VideoStatus.READY,
    });

    const response = await request(app.getHttpServer())
      .get(`/videos/${video.id}`)
      .set('Authorization', `Bearer ${nonOwner.accessToken}`)
      .expect(403);

    expect(response.body.error).toBe('VIDEO_NOT_OWNED');
  });

  test('ready-video-returns-stream-url', async () => {
    const owner = await registerConfirmAndLogin('video-stream@example.com');
    const video = await createVideo(owner, {
      status: VideoStatus.READY,
      processed_object_key: `videos/processed/${owner.user.id}/video-1/clip.mp4`,
    });

    const response = await request(app.getHttpServer())
      .get(`/videos/${video.public_id}/stream-url`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      public_id: video.public_id,
      stream_url: `https://storage.local/${video.processed_object_key}`,
      expires_in_seconds: 600,
    });
    expect(storageService.presignStreamUrl).toHaveBeenCalledWith({
      objectKey: video.processed_object_key,
    });
  });

  test('processing-video-stream-url-is-not-ready', async () => {
    const owner = await registerConfirmAndLogin(
      'video-processing-stream@example.com',
    );
    const video = await createVideo(owner, {
      status: VideoStatus.PROCESSING,
      processed_object_key: null,
    });

    const response = await request(app.getHttpServer())
      .get(`/videos/${video.public_id}/stream-url`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(409);

    expect(response.body.error).toBe('VIDEO_NOT_READY');
    expect(storageService.presignStreamUrl).not.toHaveBeenCalled();
  });

  test('ready-video-returns-download-url-with-filename', async () => {
    const owner = await registerConfirmAndLogin('video-download@example.com');
    const video = await createVideo(owner, {
      status: VideoStatus.READY,
      processed_object_key: `videos/processed/${owner.user.id}/video-1/clip.mp4`,
      original_filename: 'download-me.mp4',
    });

    const response = await request(app.getHttpServer())
      .get(`/videos/${video.public_id}/download-url`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      public_id: video.public_id,
      download_url: `https://storage.local/${video.processed_object_key}?download=1`,
      expires_in_seconds: 600,
      filename: 'download-me.mp4',
    });
    expect(storageService.presignDownloadUrl).toHaveBeenCalledWith({
      objectKey: video.processed_object_key,
      downloadFilename: 'download-me.mp4',
    });
  });
});
