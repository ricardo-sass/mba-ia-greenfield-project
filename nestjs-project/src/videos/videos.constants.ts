export const VIDEO_QUEUES = {
  PROCESSING: 'video-processing',
} as const;

export const VIDEO_QUEUE_JOBS = {
  PROCESS: 'video.process',
} as const;

export const VIDEO_STORAGE_PREFIXES = {
  RAW: 'videos/raw',
  PROCESSED: 'videos/processed',
  THUMBNAILS: 'videos/thumbnails',
} as const;

export const VIDEO_UPLOAD_LIMITS = {
  MAX_VIDEO_SIZE_BYTES: 10 * 1024 * 1024 * 1024,
  MIN_MULTIPART_PART_NUMBER: 1,
  MAX_MULTIPART_PART_NUMBER: 10_000,
  MIN_MULTIPART_PART_SIZE_BYTES: 5 * 1024 * 1024,
} as const;

export const VIDEO_UPLOAD_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
] as const;

export const VIDEO_PRESIGN_TTLS_SECONDS = {
  UPLOAD_PART: 900,
  READ: 300,
} as const;
