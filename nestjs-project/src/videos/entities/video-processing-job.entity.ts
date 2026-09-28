import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Video } from './video.entity';

export enum VideoProcessingJobStatus {
  QUEUED = 'queued',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('video_processing_jobs')
export class VideoProcessingJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  video_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  bullmq_job_id: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: VideoProcessingJobStatus,
    default: VideoProcessingJobStatus.QUEUED,
  })
  status: VideoProcessingJobStatus;

  @Column({ type: 'integer', default: 0 })
  attempts_made: number;

  @Column({ type: 'text', nullable: true })
  last_error: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @ManyToOne(() => Video, (video) => video.processing_jobs)
  @JoinColumn({ name: 'video_id' })
  video: Video;
}
