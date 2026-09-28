import { VideoObjectKeysService } from './video-object-keys.service';

describe('VideoObjectKeysService', () => {
  let service: VideoObjectKeysService;

  beforeEach(() => {
    service = new VideoObjectKeysService();
  });

  it('builds deterministic raw object keys', () => {
    expect(
      service.raw({
        ownerUserId: 'owner-1',
        videoId: 'video-1',
        filename: 'clip.mp4',
      }),
    ).toBe('videos/raw/owner-1/video-1/clip.mp4');
  });

  it('builds deterministic processed object keys', () => {
    expect(
      service.processed({
        ownerUserId: 'owner-1',
        videoId: 'video-1',
        filename: 'clip-processed.mp4',
      }),
    ).toBe('videos/processed/owner-1/video-1/clip-processed.mp4');
  });

  it('builds deterministic thumbnail object keys', () => {
    expect(
      service.thumbnail({
        ownerUserId: 'owner-1',
        videoId: 'video-1',
        filename: 'poster.jpg',
      }),
    ).toBe('videos/thumbnails/owner-1/video-1/poster.jpg');
  });

  it('uses only the filename segment when a path is provided', () => {
    expect(
      service.raw({
        ownerUserId: 'owner-1',
        videoId: 'video-1',
        filename: '../nested/clip.mp4',
      }),
    ).toBe('videos/raw/owner-1/video-1/clip.mp4');
  });
});
