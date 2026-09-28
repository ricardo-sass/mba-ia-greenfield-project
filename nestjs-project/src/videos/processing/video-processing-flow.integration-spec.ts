import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Queue } from 'bullmq';
import { DataSource, type Repository } from 'typeorm';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { VerificationToken } from '../../auth/entities/verification-token.entity';
import { Channel } from '../../channels/entities/channel.entity';
import queueConfig from '../../config/queue.config';
import storageConfig from '../../config/storage.config';
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
import { VideosStorageService } from '../storage/videos-storage.service';
import { VideoObjectKeysService } from '../video-object-keys.service';
import { VideoProcessingQueueService } from '../video-processing-queue.service';
import { VIDEO_QUEUES } from '../videos.constants';
import type { VideoProcessJobPayload } from '../videos.types';
import { VideoMediaProcessorService } from './video-media-processor.service';
import { VideoProcessor } from './video.processor';

const execFileAsync = promisify(execFile);

const ALL_ENTITIES = [
  User,
  Channel,
  RefreshToken,
  VerificationToken,
  Video,
  VideoUploadPart,
  VideoProcessingJob,
];

async function waitFor(
  assertion: () => Promise<boolean>,
  timeoutMs = 30000,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await assertion()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out after ${timeoutMs}ms`);
}

describe('video processing flow (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let queue: Queue<VideoProcessJobPayload>;
  let storageService: VideosStorageService;
  let videoRepository: Repository<Video>;
  let processingJobRepository: Repository<VideoProcessingJob>;
  let s3Client: S3Client;
  let workdir: string;
  let sourceVideoPath: string;
  const objectKeysToDelete = new Set<string>();

  beforeAll(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'streamtube-worker-flow-'));
    sourceVideoPath = join(workdir, 'source.mp4');
    await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=160x90:d=1',
      '-vf',
      'format=yuv420p',
      sourceVideoPath,
    ]);

    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [queueConfig, storageConfig],
        }),
        BullModule.forRoot({
          connection: {
            host: process.env.QUEUE_REDIS_HOST ?? 'redis',
            port: Number(process.env.QUEUE_REDIS_PORT ?? 6379),
            password: process.env.QUEUE_REDIS_PASSWORD || undefined,
          },
        }),
        BullModule.registerQueue({ name: VIDEO_QUEUES.PROCESSING }),
        TypeOrmModule.forRoot(createTestDataSource(ALL_ENTITIES).options),
        TypeOrmModule.forFeature([
          User,
          Channel,
          Video,
          VideoUploadPart,
          VideoProcessingJob,
        ]),
      ],
      providers: [
        VideoObjectKeysService,
        VideosStorageService,
        VideoMediaProcessorService,
        VideoProcessor,
        VideoProcessingQueueService,
      ],
    }).compile();
    await moduleRef.init();

    dataSource = moduleRef.get(DataSource);
    queue = moduleRef.get<Queue<VideoProcessJobPayload>>(
      getQueueToken(VIDEO_QUEUES.PROCESSING),
    );
    storageService = moduleRef.get(VideosStorageService);
    videoRepository = dataSource.getRepository(Video);
    processingJobRepository = dataSource.getRepository(VideoProcessingJob);

    const storage = storageConfig();
    s3Client = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      forcePathStyle: storage.forcePathStyle,
      credentials: {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
      },
    });
  }, 30000);

  afterAll(async () => {
    for (const objectKey of objectKeysToDelete) {
      await s3Client
        .send(
          new DeleteObjectCommand({
            Bucket: storageConfig().bucket,
            Key: objectKey,
          }),
        )
        .catch(() => undefined);
    }
    s3Client.destroy();
    await moduleRef.close();
    await rm(workdir, { force: true, recursive: true });
  });

  beforeEach(async () => {
    await queue.obliterate({ force: true });
    await cleanAllTables(dataSource);
    objectKeysToDelete.clear();
  });

  it('consumes a real BullMQ job, runs FFmpeg/ffprobe, stores media in MinIO, and marks the video ready', async () => {
    const user = await dataSource.getRepository(User).save({
      email: `worker-flow-${Date.now()}@example.com`,
      password: 'hashed-password',
    });
    const channel = await dataSource.getRepository(Channel).save({
      name: 'Worker Flow Channel',
      nickname: `worker_flow_${Date.now()}`,
      user_id: user.id,
    });
    const video = await videoRepository.save({
      owner_user_id: user.id,
      channel_id: channel.id,
      public_id: `worker_${Date.now()}`,
      status: VideoStatus.PROCESSING,
      original_object_key: `videos/raw/${user.id}/worker-flow/source.mp4`,
      original_filename: 'source.mp4',
      mime_type: 'video/mp4',
      size_bytes: '4096',
    });
    objectKeysToDelete.add(video.original_object_key);
    objectKeysToDelete.add(
      `videos/processed/${user.id}/${video.id}/source.mp4`,
    );
    objectKeysToDelete.add(
      `videos/thumbnails/${user.id}/${video.id}/source.jpg`,
    );

    await storageService.uploadObjectFromFile({
      objectKey: video.original_object_key,
      filePath: sourceVideoPath,
      contentType: 'video/mp4',
      metadata: { videoId: video.id },
    });
    const processingJob = await processingJobRepository.save({
      video_id: video.id,
      status: VideoProcessingJobStatus.QUEUED,
    });

    const job = await queue.add('video.process', {
      videoId: video.id,
      originalObjectKey: video.original_object_key,
      attempt: 1,
    });
    await processingJobRepository.update(processingJob.id, {
      bullmq_job_id: String(job.id),
    });

    await waitFor(async () => {
      const current = await videoRepository.findOneByOrFail({ id: video.id });
      return current.status === VideoStatus.READY;
    });

    const readyVideo = await videoRepository.findOneByOrFail({ id: video.id });
    expect(readyVideo).toMatchObject({
      status: VideoStatus.READY,
      processed_object_key: `videos/processed/${user.id}/${video.id}/source.mp4`,
      thumbnail_object_key: `videos/thumbnails/${user.id}/${video.id}/source.jpg`,
      processing_attempts: 1,
      failure_reason: null,
    });
    expect(Number(readyVideo.duration_seconds)).toBeGreaterThan(0);
    expect(readyVideo.metadata).toEqual(
      expect.objectContaining({
        format: expect.objectContaining({ duration: expect.any(String) }),
      }),
    );

    const completedJob = await processingJobRepository.findOneByOrFail({
      id: processingJob.id,
    });
    expect(completedJob).toMatchObject({
      bullmq_job_id: String(job.id),
      status: VideoProcessingJobStatus.COMPLETED,
      attempts_made: 1,
      last_error: null,
    });

    await expect(
      storageService.presignStreamUrl({
        objectKey: readyVideo.processed_object_key as string,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        url: expect.stringContaining(readyVideo.processed_object_key as string),
      }),
    );
    await expect(
      storageService.presignStreamUrl({
        objectKey: readyVideo.thumbnail_object_key as string,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        url: expect.stringContaining(readyVideo.thumbnail_object_key as string),
      }),
    );
  }, 45000);
});
