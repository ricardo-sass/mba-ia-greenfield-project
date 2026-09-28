import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { AbortVideoUploadResponseDto } from './dto/abort-video-upload.dto';
import {
  CompleteVideoUploadDto,
  CompleteVideoUploadResponseDto,
} from './dto/complete-video-upload.dto';
import {
  InitiateVideoUploadDto,
  InitiateVideoUploadResponseDto,
} from './dto/initiate-video-upload.dto';
import {
  SignVideoUploadPartsDto,
  SignVideoUploadPartsResponseDto,
} from './dto/sign-video-upload-parts.dto';
import {
  VideoDetailResponseDto,
  VideoDownloadUrlResponseDto,
  VideoStreamUrlResponseDto,
} from './dto/video-access.dto';
import { VideosService } from './videos.service';

@ApiTags('videos')
@ApiBearerAuth('access-token')
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post('uploads')
  @ApiOperation({
    summary: 'Initiate a multipart video upload',
    description:
      'Creates a video draft and starts a direct-to-storage multipart upload.',
  })
  @ApiResponse({
    status: 201,
    description: 'Multipart upload initiated',
    type: InitiateVideoUploadResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'An incompatible upload is already open',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 500,
    description: 'Storage failed to initiate multipart upload',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async initiateUpload(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InitiateVideoUploadDto,
  ): Promise<InitiateVideoUploadResponseDto> {
    const result = await this.videosService.initiateUploadForOwner({
      ownerUserId: user.sub,
      originalFilename: dto.original_filename,
      mimeType: dto.mime_type,
      sizeBytes: dto.size_bytes,
      partCount: dto.part_count,
    });

    return {
      id: result.id,
      public_id: result.publicId,
      status: result.status,
      multipart_upload_id: result.multipartUploadId,
      object_key: result.objectKey,
      part_size_bytes: result.partSizeBytes,
    };
  }

  @Post(':id/upload-parts/sign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign multipart upload parts',
    description:
      'Returns presigned direct-to-storage URLs for the requested upload part numbers.',
  })
  @ApiResponse({
    status: 200,
    description: 'Upload part URLs signed',
    type: SignVideoUploadPartsResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 403,
    description: 'Video does not belong to the authenticated user',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'Video upload is not open',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 500,
    description: 'Storage failed to presign upload URLs',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async signUploadParts(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SignVideoUploadPartsDto,
  ): Promise<SignVideoUploadPartsResponseDto> {
    const result = await this.videosService.signUploadParts({
      ownerUserId: user.sub,
      videoId: id,
      partNumbers: dto.part_numbers,
    });

    return {
      video_id: result.videoId,
      expires_in_seconds: result.expiresInSeconds,
      parts: result.parts.map((part) => ({
        part_number: part.partNumber,
        upload_url: part.uploadUrl,
      })),
    };
  }

  @Post(':id/upload-complete')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Complete a multipart video upload',
    description:
      'Completes the storage multipart upload and enqueues background video processing.',
  })
  @ApiResponse({
    status: 202,
    description: 'Upload completed and processing enqueued',
    type: CompleteVideoUploadResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 403,
    description: 'Video does not belong to the authenticated user',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'Video upload is not open or processing is already enqueued',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 500,
    description: 'Storage completion or queue enqueue failed',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async completeUpload(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CompleteVideoUploadDto,
  ): Promise<CompleteVideoUploadResponseDto> {
    const result = await this.videosService.completeUpload({
      ownerUserId: user.sub,
      videoId: id,
      parts: dto.parts.map((part) => ({
        partNumber: part.part_number,
        eTag: part.etag,
        sizeBytes: part.size_bytes,
      })),
    });

    return {
      id: result.id,
      public_id: result.publicId,
      status: result.status,
      processing_job_id: result.processingJobId,
    };
  }

  @Delete(':id/upload')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Abort an open multipart video upload',
    description:
      'Aborts the storage multipart upload and returns the video draft to the draft state.',
  })
  @ApiResponse({ status: 204, description: 'Upload aborted successfully' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 403,
    description: 'Video does not belong to the authenticated user',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'Video upload is not open',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 500,
    description: 'Storage failed to abort multipart upload',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async abortUpload(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AbortVideoUploadResponseDto> {
    const result = await this.videosService.abortUpload({
      ownerUserId: user.sub,
      videoId: id,
    });

    return {
      id: result.id,
      public_id: result.publicId,
      status: result.status,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get video detail',
    description:
      'Returns the authenticated owner video lifecycle state and available media metadata.',
  })
  @ApiResponse({
    status: 200,
    description: 'Video detail returned',
    type: VideoDetailResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 403,
    description: 'Video does not belong to the authenticated user',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async getVideoDetail(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<VideoDetailResponseDto> {
    const result = await this.videosService.getVideoDetail({
      ownerUserId: user.sub,
      videoId: id,
    });

    return {
      id: result.id,
      public_id: result.publicId,
      status: result.status,
      original_filename: result.originalFilename,
      mime_type: result.mimeType,
      size_bytes: result.sizeBytes,
      duration_seconds: result.durationSeconds,
      thumbnail_url: result.thumbnailUrl,
      failure_reason: result.failureReason,
      created_at: result.createdAt.toISOString(),
      updated_at: result.updatedAt.toISOString(),
    };
  }

  @Get(':publicId/stream-url')
  @ApiOperation({
    summary: 'Get video stream URL',
    description:
      'Returns a short-lived signed object-storage URL for owner playback when processing is complete.',
  })
  @ApiResponse({
    status: 200,
    description: 'Stream URL returned',
    type: VideoStreamUrlResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 403,
    description: 'Video does not belong to the authenticated user',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'Video is not ready',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 500,
    description: 'Storage failed to presign the stream URL',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async getStreamUrl(
    @CurrentUser() user: JwtPayload,
    @Param('publicId') publicId: string,
  ): Promise<VideoStreamUrlResponseDto> {
    const result = await this.videosService.getStreamUrl({
      ownerUserId: user.sub,
      publicId,
    });

    return {
      public_id: result.publicId,
      stream_url: result.streamUrl,
      expires_in_seconds: result.expiresInSeconds,
    };
  }

  @Get(':publicId/download-url')
  @ApiOperation({
    summary: 'Get video download URL',
    description:
      'Returns a short-lived signed object-storage URL with attachment disposition for owner download.',
  })
  @ApiResponse({
    status: 200,
    description: 'Download URL returned',
    type: VideoDownloadUrlResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 403,
    description: 'Video does not belong to the authenticated user',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'Video is not ready',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 500,
    description: 'Storage failed to presign the download URL',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async getDownloadUrl(
    @CurrentUser() user: JwtPayload,
    @Param('publicId') publicId: string,
  ): Promise<VideoDownloadUrlResponseDto> {
    const result = await this.videosService.getDownloadUrl({
      ownerUserId: user.sub,
      publicId,
    });

    return {
      public_id: result.publicId,
      download_url: result.downloadUrl,
      expires_in_seconds: result.expiresInSeconds,
      filename: result.filename,
    };
  }
}
