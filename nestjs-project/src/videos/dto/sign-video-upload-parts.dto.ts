import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsInt, Max, Min } from 'class-validator';
import { VIDEO_UPLOAD_LIMITS } from '../videos.constants';

export class SignVideoUploadPartsDto {
  /** Multipart part numbers that need presigned upload URLs. */
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(VIDEO_UPLOAD_LIMITS.MIN_MULTIPART_PART_NUMBER, { each: true })
  @Max(VIDEO_UPLOAD_LIMITS.MAX_MULTIPART_PART_NUMBER, { each: true })
  part_numbers: number[];
}

export class SignedVideoUploadPartDto {
  @ApiProperty()
  part_number: number;

  @ApiProperty()
  upload_url: string;
}

export class SignVideoUploadPartsResponseDto {
  @ApiProperty({ format: 'uuid' })
  video_id: string;

  @ApiProperty()
  expires_in_seconds: number;

  @ApiProperty({ type: [SignedVideoUploadPartDto] })
  parts: SignedVideoUploadPartDto[];
}
