import { Test, TestingModule } from '@nestjs/testing';
import { IS_PUBLIC } from '../common/decorators.js';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';

describe('PostsController itinerary attachment', () => {
  let controller: PostsController;
  const posts = { attachItinerary: vi.fn(), detachItinerary: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostsController],
      providers: [{ provide: PostsService, useValue: posts }],
    }).compile();
    controller = module.get(PostsController);
  });

  it('forwards attach and detach requests with the authenticated owner', () => {
    const user = { sub: 'user-id' } as any;
    const dto = { itineraryId: '64b000000000000000000001' } as any;
    controller.attachItinerary('64b000000000000000000002', dto, user);
    controller.detachItinerary('64b000000000000000000002', user);
    expect(posts.attachItinerary).toHaveBeenCalledWith('64b000000000000000000002', dto, user);
    expect(posts.detachItinerary).toHaveBeenCalledWith('64b000000000000000000002', user);
  });

  it('keeps itinerary attachment owner-only while public post details remain guest-accessible', () => {
    const prototype = PostsController.prototype;
    expect(Reflect.getMetadata(IS_PUBLIC, prototype.attachItinerary)).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC, prototype.detachItinerary)).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC, prototype.postPage)).toBe(true);
  });
});
