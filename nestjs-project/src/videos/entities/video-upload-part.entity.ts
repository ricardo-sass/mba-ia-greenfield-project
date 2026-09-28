import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Video } from './video.entity';

@Entity('video_upload_parts')
@Index(['video_id', 'part_number'], { unique: true })
export class VideoUploadPart {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  video_id: string;

  @Column({ type: 'integer' })
  part_number: number;

  @Column({ type: 'varchar', length: 255 })
  etag: string;

  @Column({ type: 'bigint', nullable: true })
  size_bytes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => Video, (video) => video.upload_parts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'video_id' })
  video: Video;
}
