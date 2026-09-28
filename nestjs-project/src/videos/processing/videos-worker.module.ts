import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from '../../channels/entities/channel.entity';
import appConfig from '../../config/app.config';
import authConfig from '../../config/auth.config';
import databaseConfig from '../../config/database.config';
import mailConfig from '../../config/mail.config';
import queueConfig from '../../config/queue.config';
import storageConfig from '../../config/storage.config';
import { envValidationSchema } from '../../config/env.validation';
import { User } from '../../users/entities/user.entity';
import { VideoProcessingJob } from '../entities/video-processing-job.entity';
import { VideoUploadPart } from '../entities/video-upload-part.entity';
import { Video } from '../entities/video.entity';
import { VideosStorageService } from '../storage/videos-storage.service';
import { VideoObjectKeysService } from '../video-object-keys.service';
import { VIDEO_QUEUES } from '../videos.constants';
import { VideoMediaProcessorService } from './video-media-processor.service';
import { VideoProcessor } from './video.processor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        authConfig,
        databaseConfig,
        mailConfig,
        queueConfig,
        storageConfig,
      ],
      validationSchema: envValidationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [queueConfig.KEY],
      useFactory: (queue: ConfigType<typeof queueConfig>) => ({
        connection: {
          host: queue.redis.host,
          port: queue.redis.port,
          password: queue.redis.password,
        },
      }),
    }),
    BullModule.registerQueue({ name: VIDEO_QUEUES.PROCESSING }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [databaseConfig.KEY],
      useFactory: (dbConfig: ConfigType<typeof databaseConfig>) => ({
        type: 'postgres',
        host: dbConfig.host,
        port: dbConfig.port,
        username: dbConfig.username,
        password: dbConfig.password,
        database: dbConfig.name,
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
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
  ],
})
export class VideosWorkerModule {}
