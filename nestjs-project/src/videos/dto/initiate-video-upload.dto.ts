import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  VIDEO_UPLOAD_LIMITS,
  VIDEO_UPLOAD_MIME_TYPES,
} from '../videos.constants';
import { VideoStatus } from '../entities/video.entity';

export class InitiateVideoUploadDto {
  /** Original filename supplied by the uploader. */
  @IsString()
  @MaxLength(255)
  original_filename: string;

  /** MIME type of the video object that will be uploaded directly to storage. */
  @IsString()
  @IsIn(VIDEO_UPLOAD_MIME_TYPES)
  mime_type: string;

  /** Total object size in bytes. */
  @IsInt()
  @Min(1)
  @Max(VIDEO_UPLOAD_LIMITS.MAX_VIDEO_SIZE_BYTES)
  size_bytes: number;

  /** Number of S3-compatible multipart chunks the client will upload. */
  @IsInt()
  @Min(VIDEO_UPLOAD_LIMITS.MIN_MULTIPART_PART_NUMBER)
  @Max(VIDEO_UPLOAD_LIMITS.MAX_MULTIPART_PART_NUMBER)
  part_count: number;
}

export class InitiateVideoUploadResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  public_id: string;

  @ApiProperty({ enum: [VideoStatus.DRAFT] })
  status: VideoStatus.DRAFT;

  @ApiProperty()
  multipart_upload_id: string;

  @ApiProperty()
  object_key: string;

  @ApiProperty()
  part_size_bytes: number;
}
