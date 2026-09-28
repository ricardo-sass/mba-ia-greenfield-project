import { writeFile } from 'node:fs/promises';
import { Video, VideoStatus } from '../entities/video.entity';
import { VideosStorageService } from '../storage/videos-storage.service';
import { VideoObjectKeysService } from '../video-object-keys.service';
import { VideoMediaProcessorService } from './video-media-processor.service';

function video(overrides: Partial<Video> = {}): Video {
  return {
    id: 'video-1',
    owner_user_id: 'owner-1',
    channel_id: 'channel-1',
    public_id: 'public-1',
    title: null,
    status: VideoStatus.PROCESSING,
    original_object_key: 'videos/raw/owner-1/video-1/clip.mp4',
    processed_object_key: null,
    thumbnail_object_key: null,
    multipart_upload_id: null,
    original_filename: 'clip.mp4',
    mime_type: 'video/mp4',
    size_bytes: '10485760',
    duration_seconds: null,
    metadata: null,
    processing_attempts: 0,
    failure_reason: null,
    created_at: new Date(),
    updated_at: new Date(),
    owner: undefined as never,
    channel: undefined as never,
    upload_parts: [],
    processing_jobs: [],
    ...overrides,
  };
}

describe('VideoMediaProcessorService', () => {
  const storageService = {
    getObjectBuffer: jest.fn(),
    uploadObject: jest.fn(),
  } as unknown as jest.Mocked<VideosStorageService>;
  const objectKeysService = {
    processed: jest.fn(),
    thumbnail: jest.fn(),
  } as unknown as jest.Mocked<VideoObjectKeysService>;

  let service: VideoMediaProcessorService;

  beforeEach(() => {
    jest.clearAllMocks();
    storageService.getObjectBuffer.mockResolvedValue(
      Buffer.from('video-bytes'),
    );
    storageService.uploadObject.mockResolvedValue(undefined);
    objectKeysService.processed.mockReturnValue(
      'videos/processed/owner-1/video-1/clip.mp4',
    );
    objectKeysService.thumbnail.mockReturnValue(
      'videos/thumbnails/owner-1/video-1/clip.jpg',
    );
    service = new VideoMediaProcessorService(storageService, objectKeysService);
  });

  it('parses ffprobe JSON, runs ffmpeg, and uploads processed and thumbnail objects', async () => {
    const runCommand = jest.spyOn(
      service as unknown as {
        runCommand(
          command: string,
          args: string[],
        ): Promise<{ stdout: string; stderr: string }>;
      },
      'runCommand',
    );
    runCommand.mockImplementation(async (command: string, args: string[]) => {
      if (command === 'ffprobe') {
        return {
          stdout: JSON.stringify({
            format: { duration: '12.345678' },
            streams: [{ codec_type: 'video', width: 1920, height: 1080 }],
          }),
          stderr: '',
        };
      }

      await writeFile(args.at(-1) as string, Buffer.from('jpeg-bytes'));
      return { stdout: '', stderr: '' };
    });

    await expect(
      service.process({
        video: video(),
        originalObjectKey: 'videos/raw/owner-1/video-1/clip.mp4',
      }),
    ).resolves.toEqual({
      durationSeconds: 12.345678,
      metadata: {
        format: { duration: '12.345678' },
        streams: [{ codec_type: 'video', width: 1920, height: 1080 }],
      },
      processedObjectKey: 'videos/processed/owner-1/video-1/clip.mp4',
      thumbnailObjectKey: 'videos/thumbnails/owner-1/video-1/clip.jpg',
    });

    expect(runCommand).toHaveBeenNthCalledWith(
      1,
      'ffprobe',
      expect.arrayContaining(['-print_format', 'json', '-show_format']),
    );
    expect(runCommand).toHaveBeenNthCalledWith(
      2,
      'ffmpeg',
      expect.arrayContaining([
        '-vf',
        'thumbnail,scale=1280:-1',
        '-frames:v',
        '1',
      ]),
    );
    expect(storageService.uploadObject).toHaveBeenCalledWith({
      objectKey: 'videos/processed/owner-1/video-1/clip.mp4',
      body: Buffer.from('video-bytes'),
      contentType: 'video/mp4',
      metadata: { videoId: 'video-1' },
    });
    expect(storageService.uploadObject).toHaveBeenCalledWith({
      objectKey: 'videos/thumbnails/owner-1/video-1/clip.jpg',
      body: Buffer.from('jpeg-bytes'),
      contentType: 'image/jpeg',
      metadata: { videoId: 'video-1' },
    });
  });

  it('rejects invalid ffprobe duration output', async () => {
    jest
      .spyOn(
        service as unknown as {
          runCommand(
            command: string,
            args: string[],
          ): Promise<{ stdout: string; stderr: string }>;
        },
        'runCommand',
      )
      .mockResolvedValue({
        stdout: JSON.stringify({ format: { duration: 'not-a-number' } }),
        stderr: '',
      });

    await expect(
      service.process({
        video: video(),
        originalObjectKey: 'videos/raw/owner-1/video-1/clip.mp4',
      }),
    ).rejects.toThrow('ffprobe did not return a valid duration');
  });
});
