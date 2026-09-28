import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import queueConfig from '../config/queue.config';
import { VIDEO_QUEUE_JOBS, VIDEO_QUEUES } from './videos.constants';
import { VideoProcessingQueueService } from './video-processing-queue.service';

describe('VideoProcessingQueueService', () => {
  const queue = {
    add: jest.fn(),
  };

  let service: VideoProcessingQueueService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        VideoProcessingQueueService,
        {
          provide: getQueueToken(VIDEO_QUEUES.PROCESSING),
          useValue: queue,
        },
        {
          provide: queueConfig.KEY,
          useValue: {
            videoProcessing: {
              attempts: 4,
              backoffMs: 15000,
            },
          },
        },
      ],
    }).compile();

    service = module.get(VideoProcessingQueueService);
  });

  it('adds video.process with attempts/backoff and returns the BullMQ job id', async () => {
    queue.add.mockResolvedValueOnce({ id: 'bull-job-1' });

    await expect(
      service.enqueueProcessJob({
        videoId: 'video-1',
        originalObjectKey: 'videos/raw/user/video/file.mp4',
        attempt: 1,
      }),
    ).resolves.toBe('bull-job-1');

    expect(queue.add).toHaveBeenCalledWith(
      VIDEO_QUEUE_JOBS.PROCESS,
      {
        videoId: 'video-1',
        originalObjectKey: 'videos/raw/user/video/file.mp4',
        attempt: 1,
      },
      {
        attempts: 4,
        backoff: {
          type: 'exponential',
          delay: 15000,
        },
      },
    );
  });
});
