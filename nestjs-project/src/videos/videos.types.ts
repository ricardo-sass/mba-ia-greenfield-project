import type { VideoStatus } from './entities/video.entity';

export interface InitiateVideoUploadInput {
  ownerUserId: string;
  channelId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  partCount: number;
}

export interface InitiateVideoUploadForOwnerInput {
  ownerUserId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  partCount: number;
}

export interface InitiateVideoUploadResult {
  id: string;
  publicId: string;
  status: VideoStatus.DRAFT;
  multipartUploadId: string;
  objectKey: string;
  partSizeBytes: number;
}

export interface SignVideoUploadPartsInput {
  ownerUserId: string;
  videoId: string;
  partNumbers: number[];
}

export interface SignedVideoUploadPart {
  partNumber: number;
  uploadUrl: string;
}

export interface SignVideoUploadPartsResult {
  videoId: string;
  expiresInSeconds: number;
  parts: SignedVideoUploadPart[];
}

export interface CompleteVideoUploadPartInput {
  partNumber: number;
  eTag: string;
  sizeBytes?: number;
}

export interface CompleteVideoUploadInput {
  ownerUserId: string;
  videoId: string;
  parts: CompleteVideoUploadPartInput[];
}

export interface CompleteVideoUploadResult {
  id: string;
  publicId: string;
  status: VideoStatus.PROCESSING;
  processingJobId: string;
}

export interface AbortVideoUploadInput {
  ownerUserId: string;
  videoId: string;
}

export interface AbortVideoUploadResult {
  id: string;
  publicId: string;
  status: VideoStatus.DRAFT;
}

export interface VideoDetailInput {
  ownerUserId: string;
  videoId: string;
}

export interface VideoDetailResult {
  id: string;
  publicId: string;
  status: VideoStatus;
  originalFilename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoAccessUrlInput {
  ownerUserId: string;
  publicId: string;
}

export interface VideoStreamUrlResult {
  publicId: string;
  streamUrl: string;
  expiresInSeconds: number;
}

export interface VideoDownloadUrlResult {
  publicId: string;
  downloadUrl: string;
  expiresInSeconds: number;
  filename: string;
}

export interface VideoProcessJobPayload {
  videoId: string;
  originalObjectKey: string;
  attempt: number;
}
