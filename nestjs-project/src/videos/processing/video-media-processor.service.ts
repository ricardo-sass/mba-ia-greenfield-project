import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { promisify } from 'node:util';
import { Video } from '../entities/video.entity';
import { VideosStorageService } from '../storage/videos-storage.service';
import { VideoObjectKeysService } from '../video-object-keys.service';

const execFileAsync = promisify(execFile);

interface ProcessVideoInput {
  video: Video;
  originalObjectKey: string;
}

interface ProcessedVideoResult {
  durationSeconds: number;
  metadata: Record<string, unknown>;
  processedObjectKey: string;
  thumbnailObjectKey: string;
}

interface CommandOutput {
  stdout: string;
  stderr: string;
}

@Injectable()
export class VideoMediaProcessorService {
  constructor(
    private readonly storageService: VideosStorageService,
    private readonly objectKeysService: VideoObjectKeysService,
  ) {}

  async process(input: ProcessVideoInput): Promise<ProcessedVideoResult> {
    const workdir = await mkdtemp(join(tmpdir(), 'streamtube-video-'));
    const inputFilename = input.video.original_filename ?? 'video';
    const inputPath = join(workdir, `source${extname(inputFilename)}`);
    const thumbnailPath = join(workdir, 'thumbnail.jpg');

    try {
      await this.storageService.downloadObjectToFile({
        objectKey: input.originalObjectKey,
        filePath: inputPath,
      });
      const probe = await this.runCommand('ffprobe', [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        inputPath,
      ]);
      const metadata = this.parseProbeMetadata(probe.stdout);

      await this.runCommand('ffmpeg', [
        '-y',
        '-i',
        inputPath,
        '-vf',
        'thumbnail,scale=1280:-1',
        '-frames:v',
        '1',
        thumbnailPath,
      ]);

      const thumbnail = await readFile(thumbnailPath);
      const processedObjectKey = this.objectKeysService.processed({
        ownerUserId: input.video.owner_user_id,
        videoId: input.video.id,
        filename: inputFilename,
      });
      const thumbnailObjectKey = this.objectKeysService.thumbnail({
        ownerUserId: input.video.owner_user_id,
        videoId: input.video.id,
        filename: `${basename(inputFilename, extname(inputFilename))}.jpg`,
      });

      await this.storageService.uploadObjectFromFile({
        objectKey: processedObjectKey,
        filePath: inputPath,
        contentType: input.video.mime_type ?? undefined,
        metadata: { videoId: input.video.id },
      });
      await this.storageService.uploadObject({
        objectKey: thumbnailObjectKey,
        body: thumbnail,
        contentType: 'image/jpeg',
        metadata: { videoId: input.video.id },
      });

      return {
        durationSeconds: metadata.durationSeconds,
        metadata: metadata.raw,
        processedObjectKey,
        thumbnailObjectKey,
      };
    } finally {
      await rm(workdir, { force: true, recursive: true });
    }
  }

  private parseProbeMetadata(stdout: string): {
    durationSeconds: number;
    raw: Record<string, unknown>;
  } {
    const raw = JSON.parse(stdout) as Record<string, unknown>;
    const format = raw.format as { duration?: string } | undefined;
    const durationSeconds = Number(format?.duration);

    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
      throw new Error('ffprobe did not return a valid duration');
    }

    return {
      durationSeconds,
      raw,
    };
  }

  private async runCommand(
    command: string,
    args: string[],
  ): Promise<CommandOutput> {
    return execFileAsync(command, args);
  }
}
