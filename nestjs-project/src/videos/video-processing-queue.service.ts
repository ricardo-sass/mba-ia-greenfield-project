import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { ConfigType } from '@nestjs/config';
import type { Queue } from 'bullmq';
import queueConfig from '../config/queue.config';
import { VIDEO_QUEUE_JOBS, VIDEO_QUEUES } from './videos.constants';
import type { VideoProcessJobPayload } from './videos.types';

@Injectable()
export class VideoProcessingQueueService {
  constructor(
    @InjectQueue(VIDEO_QUEUES.PROCESSING)
    private readonly queue: Queue<VideoProcessJobPayload>,
    @Inject(queueConfig.KEY)
    private readonly queueSettings: ConfigType<typeof queueConfig>,
  ) {}

  async enqueueProcessJob(payload: VideoProcessJobPayload): Promise<string> {
    const job = await this.queue.add(VIDEO_QUEUE_JOBS.PROCESS, payload, {
      attempts: this.queueSettings.videoProcessing.attempts,
      backoff: {
        type: 'exponential',
        delay: this.queueSettings.videoProcessing.backoffMs,
      },
    });

    return String(job.id);
  }
}
