import { VideoPublicIdService } from './video-public-id.service';

describe('VideoPublicIdService', () => {
  let service: VideoPublicIdService;

  beforeEach(() => {
    service = new VideoPublicIdService();
    Object.assign(service, {
      generateCandidate: jest.fn(() => 'abc_DEF-1234'),
    });
  });

  it('generates non-empty URL-safe public ids', async () => {
    const publicId = await service.generate();

    expect(publicId).toHaveLength(12);
    expect(publicId).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('retries when persistence reports a unique constraint collision', async () => {
    const candidates = ['first-id_123', 'second-id456'];
    Object.assign(service, {
      generateCandidate: jest.fn(() => candidates.shift()),
    });
    const uniqueViolation = Object.assign(new Error('duplicate public id'), {
      code: '23505',
    });
    const persist = jest
      .fn()
      .mockRejectedValueOnce(uniqueViolation)
      .mockResolvedValueOnce({ id: 'video-1' });

    await expect(service.createWithUniquePublicId(persist)).resolves.toEqual({
      id: 'video-1',
    });
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[0][0]).not.toBe(persist.mock.calls[1][0]);
  });

  it('does not retry non-unique persistence failures', async () => {
    const failure = new Error('db unavailable');
    const persist = jest.fn().mockRejectedValue(failure);

    await expect(service.createWithUniquePublicId(persist)).rejects.toThrow(
      failure,
    );
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
