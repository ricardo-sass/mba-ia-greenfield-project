import { Injectable } from '@nestjs/common';
import { VIDEO_STORAGE_PREFIXES } from './videos.constants';

interface VideoObjectKeyInput {
  ownerUserId: string;
  videoId: string;
  filename: string;
}

@Injectable()
export class VideoObjectKeysService {
  raw(input: VideoObjectKeyInput): string {
    return this.key(VIDEO_STORAGE_PREFIXES.RAW, input);
  }

  processed(input: VideoObjectKeyInput): string {
    return this.key(VIDEO_STORAGE_PREFIXES.PROCESSED, input);
  }

  thumbnail(input: VideoObjectKeyInput): string {
    return this.key(VIDEO_STORAGE_PREFIXES.THUMBNAILS, input);
  }

  private key(prefix: string, input: VideoObjectKeyInput): string {
    return [
      prefix,
      input.ownerUserId,
      input.videoId,
      this.safeFilename(input.filename),
    ].join('/');
  }

  private safeFilename(filename: string): string {
    const normalized = filename.trim().replace(/\\/g, '/');
    const basename = normalized.split('/').filter(Boolean).at(-1);
    return basename ?? 'video';
  }
}
