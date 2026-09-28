import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Job } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import {
  VideoProcessingJob,
  VideoProcessingJobStatus,
} from '../entities/video-processing-job.entity';
import { Video, VideoStatus } from '../entities/video.entity';
import { VIDEO_QUEUE_JOBS, VIDEO_QUEUES } from '../videos.constants';
import type { VideoProcessJobPayload } from '../videos.types';
import { VideoMediaProcessorService } from './video-media-processor.service';

@Injectable()
@Processor(VIDEO_QUEUES.PROCESSING, { concurrency: 1 })
export class VideoProcessor extends WorkerHost {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Video)
    private readonly videosRepository: Repository<Video>,
    @InjectRepository(VideoProcessingJob)
    private readonly processingJobsRepository: Repository<VideoProcessingJob>,
    private readonly mediaProcessor: VideoMediaProcessorService,
  ) {
    super();
  }

  async process(job: Job<VideoProcessJobPayload>): Promise<void> {
    if (job.name !== VIDEO_QUEUE_JOBS.PROCESS) {
      throw new Error(`Unsupported video queue job: ${job.name}`);
    }

    const currentAttempt = job.attemptsMade + 1;
    const maxAttempts = Number(job.opts.attempts ?? 1);
    const video = await this.videosRepository.findOneBy({
      id: job.data.videoId,
    });

    if (!video) {
      throw new Error(`Video ${job.data.videoId} was not found`);
    }
    if (video.status === VideoStatus.READY) {
      return;
    }
    if (video.status !== VideoStatus.PROCESSING || !video.original_object_key) {
      throw new Error(`Video ${video.id} is not eligible for processing`);
    }

    const processingJob = await this.findProcessingJob(video.id, job.id);
    await this.markActive(processingJob, currentAttempt);

    try {
      const result = await this.mediaProcessor.process({
        video,
        originalObjectKey: job.data.originalObjectKey,
      });

      await this.dataSource.transaction(async (manager) => {
        await manager.save(Video, {
          id: video.id,
          status: VideoStatus.READY,
          duration_seconds: result.durationSeconds.toFixed(3),
          metadata: result.metadata,
          processed_object_key: result.processedObjectKey,
          thumbnail_object_key: result.thumbnailObjectKey,
          processing_attempts: currentAttempt,
          failure_reason: null,
        });
        await manager.update(VideoProcessingJob, processingJob.id, {
          status: VideoProcessingJobStatus.COMPLETED,
          attempts_made: currentAttempt,
          last_error: null,
        });
      });
    } catch (error) {
      const message = this.errorMessage(error);
      if (currentAttempt >= maxAttempts) {
        await this.markFailed(
          video.id,
          processingJob.id,
          currentAttempt,
          message,
        );
      } else {
        await this.processingJobsRepository.update(processingJob.id, {
          attempts_made: currentAttempt,
          last_error: message,
        });
      }

      throw error;
    }
  }

  private async findProcessingJob(
    videoId: string,
    bullmqJobId: string | number | undefined,
  ): Promise<VideoProcessingJob> {
    const normalizedJobId =
      bullmqJobId === undefined ? null : String(bullmqJobId);
    const processingJob = normalizedJobId
      ? await this.processingJobsRepository.findOne({
          where: { bullmq_job_id: normalizedJobId },
        })
      : null;

    if (processingJob) {
      return processingJob;
    }

    const latestJob = await this.processingJobsRepository.findOne({
      where: { video_id: videoId },
      order: { created_at: 'DESC' },
    });

    if (!latestJob) {
      throw new Error(`Processing job for video ${videoId} was not found`);
    }

    return latestJob;
  }

  private async markActive(
    processingJob: VideoProcessingJob,
    currentAttempt: number,
  ): Promise<void> {
    await this.processingJobsRepository.update(processingJob.id, {
      status: VideoProcessingJobStatus.ACTIVE,
      attempts_made: currentAttempt,
    });
  }

  private async markFailed(
    videoId: string,
    processingJobId: string,
    currentAttempt: number,
    message: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Video, videoId, {
        status: VideoStatus.FAILED,
        processing_attempts: currentAttempt,
        failure_reason: message,
      });
      await manager.update(VideoProcessingJob, processingJobId, {
        status: VideoProcessingJobStatus.FAILED,
        attempts_made: currentAttempt,
        last_error: message,
      });
    });
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    return 'Video processing failed';
  }
}
