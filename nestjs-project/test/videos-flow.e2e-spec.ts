import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { getQueueToken, getSharedConfigToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { hash } from 'argon2';
import type { Queue } from 'bullmq';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity';
import { Channel } from '../src/channels/entities/channel.entity';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import queueConfig from '../src/config/queue.config';
import storageConfig from '../src/config/storage.config';
import { User } from '../src/users/entities/user.entity';
import type { InitiateVideoUploadResponseDto } from '../src/videos/dto/initiate-video-upload.dto';
import type { SignVideoUploadPartsResponseDto } from '../src/videos/dto/sign-video-upload-parts.dto';
import type {
  VideoDetailResponseDto,
  VideoDownloadUrlResponseDto,
  VideoStreamUrlResponseDto,
} from '../src/videos/dto/video-access.dto';
import {
  VideoProcessingJob,
  VideoProcessingJobStatus,
} from '../src/videos/entities/video-processing-job.entity';
import { VideoUploadPart } from '../src/videos/entities/video-upload-part.entity';
import { Video, VideoStatus } from '../src/videos/entities/video.entity';
import { VideoProcessor } from '../src/videos/processing/video.processor';
import { VideosWorkerModule } from '../src/videos/processing/videos-worker.module';
import { VIDEO_QUEUES } from '../src/videos/videos.constants';

const execFileAsync = promisify(execFile);
const PART_SIZE = 5 * 1024 * 1024;

describe('videos real upload-to-playback flow (e2e)', () => {
  let app: INestApplication<App>;
  let workerModule: TestingModule;
  let dataSource: DataSource;
  let queue: Queue;
  let s3: S3Client;
  let workdir: string;
  let source: Buffer;
  let ownerToken: string;
  let otherToken: string;
  const users: string[] = [];
  const videoIds: string[] = [];
  // Only configuration is overridden: every service, repository and processor is real.
  // A unique Redis prefix prevents the Compose worker from stealing these jobs.
  const prefix = `video-e2e-${randomUUID()}`;
  const settings = {
    ...queueConfig(),
    videoProcessing: { attempts: 2, backoffMs: 1000 },
  };
  const connection = { connection: settings.redis, prefix };

  beforeAll(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'streamtube-e2e-'));
    const sourcePath = join(workdir, 'source.mov');
    // Uncompressed, valid video >5 MiB exercises two actual S3 multipart parts.
    await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x240:rate=25:duration=1',
      '-c:v',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-threads',
      '1',
      sourcePath,
    ]);
    source = await readFile(sourcePath);
    expect(source.length).toBeGreaterThan(PART_SIZE);
    expect(source.length).toBeLessThan(2 * PART_SIZE);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getSharedConfigToken())
      .useValue(connection)
      .overrideProvider(queueConfig.KEY)
      .useValue(settings)
      .compile();
    app = moduleRef.createNestApplication();
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
    dataSource = app.get(DataSource);
    queue = app.get<Queue>(getQueueToken(VIDEO_QUEUES.PROCESSING));
    await queue.waitUntilReady();

    workerModule = await Test.createTestingModule({
      imports: [VideosWorkerModule],
    })
      .overrideProvider(getSharedConfigToken())
      .useValue(connection)
      .overrideProvider(queueConfig.KEY)
      .useValue(settings)
      .compile();
    await workerModule.init();
    await workerModule.get(VideoProcessor).worker.waitUntilReady();

    const storage = storageConfig();
    s3 = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      forcePathStyle: storage.forcePathStyle,
      credentials: {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
      },
    });
    ownerToken = await createAccount();
    otherToken = await createAccount();
  }, 30000);

  afterAll(async () => {
    // Close the real worker before deleting its records or queue keys.
    try {
      await workerModule?.close();
      if (queue) await queue.obliterate({ force: true }); // This suite's prefix only.
      if (dataSource?.isInitialized) {
        for (const id of videoIds) {
          const video = await dataSource.getRepository(Video).findOneBy({ id });
          if (video && s3) {
            if (video.multipart_upload_id && video.original_object_key) {
              await s3.send(
                new AbortMultipartUploadCommand({
                  Bucket: storageConfig().bucket,
                  Key: video.original_object_key,
                  UploadId: video.multipart_upload_id,
                }),
              );
            }
            for (const key of [
              video.original_object_key,
              video.processed_object_key,
              video.thumbnail_object_key,
            ]) {
              if (key)
                await s3.send(
                  new DeleteObjectCommand({
                    Bucket: storageConfig().bucket,
                    Key: key,
                  }),
                );
            }
          }
          await dataSource
            .getRepository(VideoProcessingJob)
            .delete({ video_id: id });
          await dataSource
            .getRepository(VideoUploadPart)
            .delete({ video_id: id });
          await dataSource.getRepository(Video).delete(id);
        }
        for (const id of users) {
          await dataSource.getRepository(RefreshToken).delete({ user_id: id });
          await dataSource.getRepository(Channel).delete({ user_id: id });
          await dataSource.getRepository(User).delete(id);
        }
      }
    } finally {
      s3?.destroy();
      try {
        await app?.close();
      } finally {
        if (workdir) await rm(workdir, { recursive: true, force: true });
      }
    }
  }, 30000);

  async function createAccount(): Promise<string> {
    const unique = randomUUID();
    const password = 'VideoAcceptance123!';
    const user = await dataSource.getRepository(User).save({
      email: `${unique}@example.com`,
      password: await hash(password),
      is_confirmed: true,
    });
    users.push(user.id);
    await dataSource
      .getRepository(Channel)
      .save({ name: 'Video E2E', nickname: unique, user_id: user.id });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password })
      .expect(200);
    return (login.body as { access_token: string }).access_token;
  }

  async function initiate(
    size: number,
  ): Promise<InitiateVideoUploadResponseDto> {
    const response = await request(app.getHttpServer())
      .post('/videos/uploads')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        original_filename: 'source.mov',
        mime_type: 'video/quicktime',
        size_bytes: size,
        part_count: Math.ceil(size / PART_SIZE),
      })
      .expect(201);
    const video = response.body as InitiateVideoUploadResponseDto;
    videoIds.push(video.id);
    expect(video.status).toBe(VideoStatus.DRAFT);
    return video;
  }

  async function upload(
    video: InitiateVideoUploadResponseDto,
    body: Buffer,
  ): Promise<void> {
    const count = Math.ceil(body.length / PART_SIZE);
    const response = await request(app.getHttpServer())
      .post(`/videos/${video.id}/upload-parts/sign`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        part_numbers: Array.from({ length: count }, (_, index) => index + 1),
      })
      .expect(200);
    const signed = response.body as SignVideoUploadPartsResponseDto;
    expect(signed.parts).toHaveLength(count);
    const parts: { part_number: number; etag: string; size_bytes: number }[] =
      [];
    for (const part of signed.parts) {
      expect(new URL(part.upload_url).origin).toBe(
        storageConfig().publicEndpoint,
      );
      const bytes = body.subarray(
        (part.part_number - 1) * PART_SIZE,
        part.part_number * PART_SIZE,
      );
      const uploaded = await fetch(part.upload_url, {
        method: 'PUT',
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(10000),
      });
      expect(uploaded.status).toBe(200);
      const etag = uploaded.headers.get('etag');
      expect(etag).toBeTruthy();
      await uploaded.arrayBuffer();
      parts.push({
        part_number: part.part_number,
        etag: etag!,
        size_bytes: bytes.length,
      });
    }
    const completed = await request(app.getHttpServer())
      .post(`/videos/${video.id}/upload-complete`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ parts })
      .expect(202);
    expect((completed.body as { status: string }).status).toBe(
      VideoStatus.PROCESSING,
    );
  }

  async function waitForStatus(
    id: string,
    expected: VideoStatus,
  ): Promise<VideoDetailResponseDto> {
    const deadline = Date.now() + 30000;
    let detail: VideoDetailResponseDto | undefined;
    do {
      const response = await request(app.getHttpServer())
        .get(`/videos/${id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      detail = response.body as VideoDetailResponseDto;
      if (detail.status === expected) return detail;
      if (detail.status === VideoStatus.FAILED)
        throw new Error(`Processing failed: ${detail.failure_reason}`);
      await setTimeout(200);
    } while (Date.now() < deadline);
    throw new Error(
      `Video ${id} did not reach ${expected}: ${JSON.stringify(detail)}`,
    );
  }

  it('uploads two real parts over HTTP and produces metadata, JPEG, byte-range playback and an identical download', async () => {
    const video = await initiate(source.length);
    const draft = await dataSource
      .getRepository(Video)
      .findOneByOrFail({ id: video.id });
    expect(draft.status).toBe(VideoStatus.DRAFT);
    expect(draft.multipart_upload_id).toBeTruthy();
    await request(app.getHttpServer())
      .get(`/videos/${video.public_id}/stream-url`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);
    const worker = workerModule.get(VideoProcessor).worker;
    await worker.pause();
    try {
      // Completion must return while the consumer is paused: processing is async.
      await upload(video, source);
      const processing = await dataSource
        .getRepository(Video)
        .findOneByOrFail({ id: video.id });
      expect(processing.status).toBe(VideoStatus.PROCESSING);
      expect(processing.multipart_upload_id).toBeNull();
      const pending = await dataSource
        .getRepository(VideoProcessingJob)
        .findOneByOrFail({ video_id: video.id });
      expect(pending.status).toBe(VideoProcessingJobStatus.QUEUED);
      const queuedJob = await queue.getJob(pending.bullmq_job_id!);
      expect(queuedJob).toBeDefined();
      expect(await queuedJob!.getState()).toBe('waiting');
    } finally {
      worker.resume();
    }
    const detail = await waitForStatus(video.id, VideoStatus.READY);
    expect(detail.duration_seconds).toBeCloseTo(1, 1);
    expect(detail.failure_reason).toBeNull();
    const persisted = await dataSource
      .getRepository(Video)
      .findOneByOrFail({ id: video.id });
    expect(Array.isArray(persisted.metadata?.streams)).toBe(true);
    expect(persisted.metadata).toHaveProperty('format.duration');
    expect(persisted.processed_object_key).toBeTruthy();
    const job = await dataSource
      .getRepository(VideoProcessingJob)
      .findOneByOrFail({ video_id: video.id });
    expect(job.status).toBe(VideoProcessingJobStatus.COMPLETED);
    expect(job.bullmq_job_id).toBeTruthy();
    const queued = await queue.getJob(job.bullmq_job_id!);
    expect(queued?.data).toMatchObject({
      videoId: video.id,
      originalObjectKey: video.object_key,
    });

    expect(detail.thumbnail_url).toBeTruthy();
    const thumbnail = await fetch(detail.thumbnail_url!, {
      signal: AbortSignal.timeout(10000),
    });
    expect(thumbnail.status).toBe(200);
    expect(thumbnail.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await thumbnail.arrayBuffer()).subarray(0, 3)).toEqual(
      Buffer.from([0xff, 0xd8, 0xff]),
    );

    const stream = await request(app.getHttpServer())
      .get(`/videos/${video.public_id}/stream-url`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const range = await fetch(
      (stream.body as VideoStreamUrlResponseDto).stream_url,
      {
        headers: { Range: 'bytes=0-1023' },
        signal: AbortSignal.timeout(10000),
      },
    );
    expect(range.status).toBe(206);
    expect(range.headers.get('content-range')).toBe(
      `bytes 0-1023/${source.length}`,
    );
    expect(Buffer.from(await range.arrayBuffer())).toEqual(
      source.subarray(0, 1024),
    );

    const download = await request(app.getHttpServer())
      .get(`/videos/${video.public_id}/download-url`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const file = await fetch(
      (download.body as VideoDownloadUrlResponseDto).download_url,
      { signal: AbortSignal.timeout(10000) },
    );
    expect(file.status).toBe(200);
    expect(file.headers.get('content-disposition')).toBe(
      'attachment; filename="source.mov"',
    );
    const downloaded = Buffer.from(await file.arrayBuffer());
    expect(downloaded.length).toBe(source.length);
    expect(createHash('sha256').update(downloaded).digest('hex')).toBe(
      createHash('sha256').update(source).digest('hex'),
    );

    for (const endpoint of ['stream-url', 'download-url']) {
      await request(app.getHttpServer())
        .get(`/videos/${video.public_id}/${endpoint}`)
        .expect(401);
      await request(app.getHttpServer())
        .get(`/videos/${video.public_id}/${endpoint}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    }
  }, 45000);

  it('retries an invalid video through the real queue, persists failure and refuses playback', async () => {
    const corrupt = Buffer.from('This is not a video');
    const video = await initiate(corrupt.length);
    await upload(video, corrupt);
    const detail = await waitForStatus(video.id, VideoStatus.FAILED);
    expect(detail.failure_reason).toBeTruthy();
    expect(detail.thumbnail_url).toBeNull();
    const job = await dataSource
      .getRepository(VideoProcessingJob)
      .findOneByOrFail({ video_id: video.id });
    expect(job.status).toBe(VideoProcessingJobStatus.FAILED);
    expect(job.attempts_made).toBe(settings.videoProcessing.attempts);
    expect(job.last_error).toBeTruthy();
    for (const endpoint of ['stream-url', 'download-url']) {
      await request(app.getHttpServer())
        .get(`/videos/${video.public_id}/${endpoint}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(409);
    }
  }, 45000);
});
