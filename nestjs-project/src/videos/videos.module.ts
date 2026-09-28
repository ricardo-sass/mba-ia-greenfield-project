import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelsModule } from '../channels/channels.module';
import { VideoProcessingJob } from './entities/video-processing-job.entity';
import { VideoUploadPart } from './entities/video-upload-part.entity';
import { Video } from './entities/video.entity';
import { VideosStorageService } from './storage/videos-storage.service';
import { VideoObjectKeysService } from './video-object-keys.service';
import { VideoProcessingQueueService } from './video-processing-queue.service';
import { VideoPublicIdService } from './video-public-id.service';
import { VIDEO_QUEUES } from './videos.constants';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: VIDEO_QUEUES.PROCESSING }),
    TypeOrmModule.forFeature([Video, VideoUploadPart, VideoProcessingJob]),
    ChannelsModule,
  ],
  controllers: [VideosController],
  providers: [
    VideosService,
    VideoPublicIdService,
    VideoObjectKeysService,
    VideosStorageService,
    VideoProcessingQueueService,
  ],
  exports: [
    TypeOrmModule,
    VideosService,
    VideoPublicIdService,
    VideoObjectKeysService,
    VideosStorageService,
    VideoProcessingQueueService,
  ],
})
export class VideosModule {}
