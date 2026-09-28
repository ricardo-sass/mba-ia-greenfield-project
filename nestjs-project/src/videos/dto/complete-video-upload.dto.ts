import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VideoStatus } from '../entities/video.entity';
import { VIDEO_UPLOAD_LIMITS } from '../videos.constants';

export class CompleteVideoUploadPartDto {
  /** Multipart part number completed by the client. */
  @IsInt()
  @Min(VIDEO_UPLOAD_LIMITS.MIN_MULTIPART_PART_NUMBER)
  @Max(VIDEO_UPLOAD_LIMITS.MAX_MULTIPART_PART_NUMBER)
  part_number: number;

  /** ETag returned by object storage for this uploaded part. */
  @IsString()
  etag: string;

  /** Optional size in bytes for this part, when known by the client. */
  @IsOptional()
  @IsInt()
  @Min(1)
  size_bytes?: number;
}

export class CompleteVideoUploadDto {
  /** Completed multipart parts, in any order. */
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CompleteVideoUploadPartDto)
  parts: CompleteVideoUploadPartDto[];
}

export class CompleteVideoUploadResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  public_id: string;

  @ApiProperty({ enum: [VideoStatus.PROCESSING] })
  status: VideoStatus.PROCESSING;

  @ApiProperty({ format: 'uuid' })
  processing_job_id: string;
}
