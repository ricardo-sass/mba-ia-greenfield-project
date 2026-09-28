import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Channel } from '../../channels/entities/channel.entity';
import { User } from '../../users/entities/user.entity';
import { VideoProcessingJob } from './video-processing-job.entity';
import { VideoUploadPart } from './video-upload-part.entity';

export enum VideoStatus {
  DRAFT = 'draft',
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

@Entity('videos')
export class Video {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  owner_user_id: string;

  @Index()
  @Column({ type: 'uuid' })
  channel_id: string;

  @Column({ type: 'varchar', length: 32, unique: true })
  public_id: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  title: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: VideoStatus,
    default: VideoStatus.DRAFT,
  })
  status: VideoStatus;

  @Column({ type: 'varchar', length: 512, nullable: true })
  original_object_key: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  processed_object_key: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  thumbnail_object_key: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  multipart_upload_id: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  original_filename: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  mime_type: string | null;

  @Column({ type: 'bigint', nullable: true })
  size_bytes: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 3, nullable: true })
  duration_seconds: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'integer', default: 0 })
  processing_attempts: number;

  @Column({ type: 'text', nullable: true })
  failure_reason: string | null;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_user_id' })
  owner: User;

  @ManyToOne(() => Channel)
  @JoinColumn({ name: 'channel_id' })
  channel: Channel;

  @OneToMany(() => VideoUploadPart, (part) => part.video)
  upload_parts: VideoUploadPart[];

  @OneToMany(() => VideoProcessingJob, (job) => job.video)
  processing_jobs: VideoProcessingJob[];
}
