import { Test } from '@nestjs/testing';
import { VideosWorkerModule } from './videos-worker.module';

describe('VideosWorkerModule', () => {
  it('compiles with queue, config, TypeOrm repositories and storage provider', async () => {
    const module = await Test.createTestingModule({
      imports: [VideosWorkerModule],
    }).compile();

    expect(module).toBeDefined();
    await module.close();
  }, 30000);
});
