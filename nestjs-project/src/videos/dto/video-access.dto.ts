import { ApiProperty } from '@nestjs/swagger';
import { VideoStatus } from '../entities/video.entity';

export class VideoDetailResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  public_id: string;

  @ApiProperty({ enum: VideoStatus })
  status: VideoStatus;

  @ApiProperty({ nullable: true })
  original_filename: string | null;

  @ApiProperty({ nullable: true })
  mime_type: string | null;

  @ApiProperty({ nullable: true })
  size_bytes: number | null;

  @ApiProperty({ nullable: true })
  duration_seconds: number | null;

  @ApiProperty({ nullable: true })
  thumbnail_url: string | null;

  @ApiProperty({ nullable: true })
  failure_reason: string | null;

  @ApiProperty({ format: 'date-time' })
  created_at: string;

  @ApiProperty({ format: 'date-time' })
  updated_at: string;
}

export class VideoStreamUrlResponseDto {
  @ApiProperty()
  public_id: string;

  @ApiProperty()
  stream_url: string;

  @ApiProperty()
  expires_in_seconds: number;
}

export class VideoDownloadUrlResponseDto {
  @ApiProperty()
  public_id: string;

  @ApiProperty()
  download_url: string;

  @ApiProperty()
  expires_in_seconds: number;

  @ApiProperty()
  filename: string;
}
