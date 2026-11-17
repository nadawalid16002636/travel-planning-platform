import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UsersService } from '../users/users.service.js';
import { ItinerariesService } from '../itineraries/itineraries.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import {
  AttachItineraryToPostDto,
  CreatePostCommentDto,
  CreatePostDto,
  PostSearchQueryDto,
  UpdatePostDto,
} from './dto/post.dto.js';
import { Post, PostStatus } from './post.schema.js';
import { PostsService } from './posts.service.js';

describe('PostsService', () => {
  let service: PostsService;
  const users = {
    findById: vi.fn(),
    basicInfo: vi.fn(),
  };
  const itineraries = {
    findPublicByAuthor: vi.fn(),
    findOne: vi.fn(),
    findPublicSummaryById: vi.fn(),
  };
  const uploads = {
    validateAndStore: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
  };

  const user = { sub: '64b000000000000000000001' } as any;

  beforeEach(async () => {
    vi.clearAllMocks();
    users.findById.mockResolvedValue({
      _id: new Types.ObjectId(user.sub),
      firstName: 'Alex',
      lastName: 'Morgan',
      email: 'private@example.test',
      createdAt: new Date('2020-01-01T00:00:00Z'),
    });
    users.basicInfo.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: getModelToken(Post.name), useValue: {} },
        { provide: UsersService, useValue: users },
        { provide: ItinerariesService, useValue: itineraries },
        { provide: UploadsService, useValue: uploads },
      ],
    }).compile();
    service = module.get(PostsService);
  });

  const chain = (result: unknown) => {
    const q: any = {};
    for (const method of ['select', 'sort', 'skip', 'limit']) q[method] = vi.fn(() => q);
    q.exec = vi.fn().mockResolvedValue(result);
    return q;
  };

  it('creates a draft with the authenticated author, normalized tags, timestamps and empty images', async () => {
    const created: any[] = [];
    const id = new Types.ObjectId();
    const model: any = function (this: any, data: any) {
      Object.assign(this, data, { _id: id, createdAt: new Date(), updatedAt: new Date() });
      this.save = vi.fn(async () => this);
      created.push(this);
    };
    (service as any).postModel = model;

    const response = await service.create({ title: '  Travel story ', body: 'Story body', tags: [' Cairo ', 'HISTORY'] }, user);
    expect(String(created[0].authorId)).toBe(user.sub);
    expect(created[0].status).toBe(PostStatus.DRAFT);
    expect(created[0].title).toBe('Travel story');
    expect(created[0].tags).toEqual(['cairo', 'history']);
    expect(created[0].images).toEqual([]);
    expect(response).toMatchObject({ id: String(id), status: 'draft', likeCount: 0, commentCount: 0 });
    expect(response).not.toHaveProperty('email');
  });

  it('creates a published post when requested and validates tag limits and post content', async () => {
    const model: any = function (this: any, data: any) {
      Object.assign(this, data, { _id: new Types.ObjectId(), save: async () => this });
    };
    (service as any).postModel = model;
    await service.create({ title: 'Published', body: 'Body', status: PostStatus.PUBLISHED }, user);
    expect((service as any).postModel).toBe(model);

    for (const value of [
      { title: '', body: 'Body' },
      { title: 'Title', body: '  ' },
      { title: 'Title', body: 'Body', tags: ['x'.repeat(31)] },
      { title: 'Title', body: 'Body', tags: ['1', '2', '3', '4', '5', '6'] },
      { title: 'Title', body: 'Body', tags: null },
    ]) {
      const dto = plainToInstance(CreatePostDto, value);
      expect(await validate(dto)).not.toEqual([]);
    }
    const valid = plainToInstance(CreatePostDto, { title: 'Title', body: 'Body', status: 'published', tags: ['A'] });
    expect(await validate(valid)).toEqual([]);
  });

  it('browses only published posts with an exact normalized tag filter and interaction counts', async () => {
    const authorId = new Types.ObjectId();
    const post = {
      _id: new Types.ObjectId(), authorId, title: 'Public', body: 'A story', tags: ['cairo'],
      images: [], likes: [new Types.ObjectId()], comments: [{}, {}], createdAt: new Date(),
    };
    const model = (service as any).postModel;
    const result = chain([post]);
    model.find = vi.fn().mockReturnValue(result);
    model.countDocuments = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(1) });
    users.basicInfo.mockResolvedValue([{ id: String(authorId), name: 'Author', email: 'private@example.test' }]);

    const response = await service.browsePublished({ page: 2, limit: 5, tag: ' Cairo ' } as any);
    expect(model.find).toHaveBeenCalledWith({ status: 'published', tags: 'cairo' });
    expect(result.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(result.skip).toHaveBeenCalledWith(5);
    expect(response.data[0]).toMatchObject({ likeCount: 1, commentCount: 2, author: { name: 'Author' } });
    expect(JSON.stringify(response)).not.toContain('private@example.test');
  });

  it('searches published posts by title, tags, or author and ranks by likes plus comments', async () => {
    const model = (service as any).postModel;
    model.aggregate = vi.fn().mockResolvedValue([{ data: [], total: [] }]);
    const response = await service.searchPublished({ keyword: 'cairo', tag: 'Travel', page: 2, limit: 10 } as any);
    const pipeline = model.aggregate.mock.calls[0][0];
    expect(pipeline[0]).toEqual({ $match: { status: 'published' } });
    expect(pipeline).toContainEqual({ $match: { tags: 'travel' } });
    expect(pipeline).toContainEqual(expect.objectContaining({ $match: expect.objectContaining({ $or: expect.arrayContaining([
      expect.objectContaining({ title: expect.any(RegExp) }),
      expect.objectContaining({ tags: expect.any(RegExp) }),
      expect.objectContaining({ authorName: expect.any(RegExp) }),
    ]) }) }));
    expect(pipeline).toContainEqual(expect.objectContaining({ $addFields: expect.objectContaining({ interactionScore: { $add: ['$likeCount', '$commentCount'] } }) }));
    const facet = pipeline.find((stage: any) => stage.$facet)?.$facet;
    expect(facet.data).toContainEqual({ $sort: { interactionScore: -1, createdAt: -1, _id: -1 } });
    expect(response).toMatchObject({ data: [], total: 0, message: 'no results' });
  });

  it('lists only the current user’s posts and filters by status without exposing full post data', async () => {
    const model = (service as any).postModel;
    const result = chain([{ _id: new Types.ObjectId(), title: 'Draft', status: 'draft', createdAt: new Date(), likes: [], comments: [] }]);
    model.find = vi.fn().mockReturnValue(result);
    model.countDocuments = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(1) });
    const response = await service.listMine({ page: 1, limit: 10, status: 'draft' } as any, user);
    expect(model.find).toHaveBeenCalledWith({ authorId: expect.any(Types.ObjectId), status: 'draft' });
    expect(response.data[0]).toHaveProperty('commentCount', 0);
    expect(response.data[0]).not.toHaveProperty('body');
  });

  it('shows paginated chronological comments on public details and hides drafts from guests', async () => {
    const authorId = new Types.ObjectId();
    const commenterId = new Types.ObjectId();
    const post: any = {
      _id: new Types.ObjectId(), authorId, title: 'Public', body: 'Full story', status: 'published', tags: [], images: [],
      likes: [new Types.ObjectId(), new Types.ObjectId()],
      comments: [
        { _id: new Types.ObjectId(), authorId: commenterId, content: 'Second', createdAt: new Date('2024-01-02') },
        { _id: new Types.ObjectId(), authorId: commenterId, content: 'First', createdAt: new Date('2024-01-01') },
      ],
      createdAt: new Date(), updatedAt: new Date(),
    };
    const model = (service as any).postModel;
    model.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(post) });
    users.findById.mockResolvedValue({ _id: authorId, firstName: 'Post', lastName: 'Author' });
    users.basicInfo.mockResolvedValue([{ id: String(commenterId), name: 'Commenter', email: 'private@example.test' }]);

    const response = await service.postPage(String(post._id), { page: 1, limit: 1 } as any);
    expect(response).toMatchObject({ body: 'Full story', likeCount: 2, commentCount: 2, comments: [{ content: 'First', author: { name: 'Commenter' } }] });
    expect(JSON.stringify(response)).not.toContain('private@example.test');

    post.status = 'draft';
    await expect(service.postPage(String(post._id), { page: 1, limit: 10 } as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.postPage(String(post._id), { page: 1, limit: 10 } as any, user)).rejects.toBeInstanceOf(NotFoundException);
    post.authorId = new Types.ObjectId(user.sub);
    await expect(service.postPage(String(post._id), { page: 1, limit: 10 } as any, user)).resolves.toMatchObject({ status: 'draft' });
  });

  it('attaches and removes post images through the shared upload service', async () => {
    const postId = new Types.ObjectId();
    const imageId = '64b0000000000000000000aa';
    const url = 'http://localhost:3000/api/uploads/files/abcdef0123456789abcdef0123456789.jpg';
    const post: any = {
      _id: postId,
      authorId: new Types.ObjectId(user.sub),
      title: 'With photos',
      body: 'Body',
      status: 'draft',
      tags: [],
      images: [],
      likes: [],
      comments: [],
      save: vi.fn(async function (this: any) { return this; }),
    };
    const model = (service as any).postModel;
    model.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(post) });
    uploads.validateAndStore.mockResolvedValue({ id: imageId, url });
    uploads.get.mockResolvedValue({ id: imageId, url, purpose: 'post', entityId: String(postId) });
    uploads.remove.mockResolvedValue(undefined);

    const file = { buffer: Buffer.from([0xff, 0xd8, 0xff]), mimetype: 'image/jpeg' } as Express.Multer.File;
    await expect(service.addImage(String(postId), file, user)).resolves.toEqual({
      id: imageId,
      url,
      images: [url],
    });
    expect(uploads.validateAndStore).toHaveBeenCalledWith(file, {
      purpose: 'post',
      entityId: String(postId),
      user,
    });

    await expect(service.removeImage(String(postId), imageId, user)).resolves.toEqual({
      deleted: true,
      id: imageId,
      images: [],
    });
    expect(uploads.remove).toHaveBeenCalledWith(imageId, user);
  });

  it('updates only supplied post fields for the owner and forbids another user', async () => {
    const post: any = {
      _id: new Types.ObjectId(), authorId: new Types.ObjectId(user.sub), title: 'Original', body: 'Keep',
      status: 'draft', tags: ['old'], images: ['preserve'], likes: [], comments: [],
      save: vi.fn(async function (this: any) { return this; }),
    };
    const model = (service as any).postModel;
    model.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(post) });
    const response = await service.update(String(post._id), { title: 'Changed', tags: [' NEW '] }, user);
    expect(post).toMatchObject({ title: 'Changed', body: 'Keep', status: 'draft', tags: ['new'], images: ['preserve'] });
    expect(response.commentCount).toBe(0);
    await expect(service.update(String(post._id), { title: 'No' }, { sub: '64b000000000000000000009' } as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.update(String(post._id), {}, user)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deletes only an owned post and rejects missing or unauthorized records', async () => {
    const postId = new Types.ObjectId();
    const post = { _id: postId, authorId: new Types.ObjectId(user.sub) };
    const model = (service as any).postModel;
    model.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(post) });
    model.deleteOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ deletedCount: 1 }) });
    await expect(service.delete(String(postId), user)).resolves.toEqual({ deleted: true, id: String(postId) });
    expect(model.deleteOne).toHaveBeenCalledWith({ _id: postId, authorId: expect.any(Types.ObjectId) });
    await expect(service.delete(String(postId), { sub: '64b000000000000000000009' } as any)).rejects.toBeInstanceOf(ForbiddenException);
    model.findById.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
    await expect(service.delete(String(postId), user)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adds, edits and deletes comments only on published posts and enforces comment ownership', async () => {
    const authorId = new Types.ObjectId(user.sub);
    const commentId = new Types.ObjectId();
    const comments: any[] = [];
    comments.push = function (...values: any[]) {
      for (const value of values) {
        value._id ??= commentId;
        value.createdAt ??= new Date();
        value.updatedAt ??= new Date();
      }
      return Array.prototype.push.apply(this, values);
    } as any;
    const post: any = {
      _id: new Types.ObjectId(), authorId, status: 'published', comments, likes: [],
      save: vi.fn(async function (this: any) { return this; }),
    };
    const model = (service as any).postModel;
    model.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(post) });
    users.findById.mockResolvedValue({ _id: authorId, firstName: 'Comment', lastName: 'Owner' });
    const created = await service.addComment(String(post._id), { content: '  Useful post!  ' }, user);
    expect(created).toMatchObject({ id: String(commentId), content: 'Useful post!', author: { name: 'Comment Owner' } });
    const updated = await service.updateComment(String(post._id), String(commentId), { content: 'Edited' }, user);
    expect(updated).toMatchObject({ updated: true, content: 'Edited' });
    await expect(service.updateComment(String(post._id), String(commentId), { content: 'No' }, { sub: '64b000000000000000000009' } as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.deleteComment(String(post._id), String(commentId), { sub: '64b000000000000000000009' } as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.deleteComment(String(post._id), String(commentId), user)).resolves.toMatchObject({ deleted: true });
    expect(post.comments).toHaveLength(0);
    await expect(service.addComment(String(post._id), { content: '  ' }, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.addComment(String(post._id), { content: 'x'.repeat(501) }, user)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('likes once with an atomic addToSet, unlikes, and derives accurate counts', async () => {
    const post: any = { _id: new Types.ObjectId(), likes: [] as Types.ObjectId[] };
    const model = (service as any).postModel;
    model.findOneAndUpdate = vi.fn((_filter: any, update: any) => {
      if (update.$addToSet) {
        const id = update.$addToSet.likes;
        if (!post.likes.some((like: Types.ObjectId) => String(like) === String(id))) post.likes.push(id);
      } else if (update.$pull) {
        post.likes = post.likes.filter((like: Types.ObjectId) => String(like) !== String(update.$pull.likes));
      }
      return { exec: vi.fn().mockResolvedValue(post) };
    });
    expect(await service.like(String(post._id), user)).toMatchObject({ liked: true, likeCount: 1 });
    expect(await service.like(String(post._id), user)).toMatchObject({ liked: true, likeCount: 1 });
    expect(model.findOneAndUpdate.mock.calls[0][1]).toEqual({ $addToSet: { likes: expect.any(Types.ObjectId) } });
    expect(await service.unlike(String(post._id), user)).toMatchObject({ liked: false, likeCount: 0 });
  });

  it('builds a public author page with only published posts and public itinerary summaries', async () => {
    const authorId = user.sub;
    users.findById.mockResolvedValue({
      _id: new Types.ObjectId(authorId), firstName: 'Alex', lastName: 'Morgan',
      email: 'private@example.test', phone: '123', createdAt: new Date('2020-01-01T00:00:00Z'),
    });
    vi.spyOn(service as any, 'listPublishedByAuthor').mockResolvedValue({ data: [{ id: 'post', status: 'published' }], page: 1, limit: 10, total: 1 });
    itineraries.findPublicByAuthor.mockResolvedValue({ data: [{ id: 'itinerary', title: 'Public only' }], page: 1, limit: 10, total: 1 });
    const response = await service.authorPage(authorId, { page: 1, limit: 10 } as any);
    expect(response.author).toEqual({ id: authorId, name: 'Alex Morgan', joinedAt: new Date('2020-01-01T00:00:00Z') });
    expect(response.posts.data).toEqual([{ id: 'post', status: 'published' }]);
    expect(response.itineraries.data).toEqual([{ id: 'itinerary', title: 'Public only' }]);
    expect(JSON.stringify(response)).not.toContain('private@example.test');
    expect(JSON.stringify(response)).not.toContain('123');
    expect(itineraries.findPublicByAuthor).toHaveBeenCalledWith(authorId, 1, 10);
  });

  it('attaches only an itinerary owned by the post author and exposes it publicly only while it is public', async () => {
    const postId = new Types.ObjectId();
    const itineraryId = new Types.ObjectId();
    const post: any = {
      _id: postId,
      authorId: new Types.ObjectId(user.sub),
      status: PostStatus.PUBLISHED,
      title: 'My trip story', body: 'Details', tags: [], images: [], likes: [], comments: [],
      createdAt: new Date(), updatedAt: new Date(),
      save: vi.fn(async function (this: any) { return this; }),
    };
    const model = (service as any).postModel;
    model.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(post) });
    itineraries.findOne.mockResolvedValue({ _id: itineraryId });
    await expect(service.attachItinerary(String(postId), { itineraryId: String(itineraryId) }, user))
      .resolves.toMatchObject({ itineraryId: String(itineraryId) });
    expect(itineraries.findOne).toHaveBeenCalledWith(String(itineraryId), user);
    expect(post.itineraryId).toEqual(itineraryId);

    const pageQuery = { page: 1, limit: 10 } as any;
    users.findById.mockResolvedValue({ _id: post.authorId, firstName: 'Alex', lastName: 'Morgan' });
    users.basicInfo.mockResolvedValue([]);
    itineraries.findPublicSummaryById.mockResolvedValue(null);
    const privateOrDeleted = await service.postPage(String(postId), pageQuery);
    expect(privateOrDeleted).not.toHaveProperty('itinerary');
    itineraries.findPublicSummaryById.mockResolvedValue({ id: String(itineraryId), title: 'Public trip', durationDays: 3 });
    const publicPage = await service.postPage(String(postId), pageQuery);
    expect(publicPage.itinerary).toEqual({ id: String(itineraryId), title: 'Public trip', durationDays: 3 });

    itineraries.findOne.mockRejectedValue(new ForbiddenException());
    post.itineraryId = undefined;
    await expect(service.attachItinerary(String(postId), { itineraryId: String(itineraryId) }, user))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(post.itineraryId).toBeUndefined();
    itineraries.findOne.mockResolvedValue({ _id: itineraryId });
    await service.detachItinerary(String(postId), user);
    expect(post.itineraryId).toBeUndefined();
  });

  it('validates comment and update DTOs, including null and the 500-character boundary', async () => {
    expect(await validate(plainToInstance(CreatePostCommentDto, { content: 'x'.repeat(500) }))).toEqual([]);
    expect(await validate(plainToInstance(CreatePostCommentDto, { content: 'x'.repeat(501) }))).not.toEqual([]);
    expect(await validate(plainToInstance(CreatePostCommentDto, { content: null }))).not.toEqual([]);
    expect(await validate(plainToInstance(UpdatePostDto, { title: null }))).not.toEqual([]);
    expect(await validate(plainToInstance(PostSearchQueryDto, { keyword: 'x', page: '0', limit: '101' }))).not.toEqual([]);
    expect(await validate(plainToInstance(AttachItineraryToPostDto, { itineraryId: '64b000000000000000000021' }))).toEqual([]);
    expect(await validate(plainToInstance(AttachItineraryToPostDto, { itineraryId: 'not-an-id' }))).not.toEqual([]);
  });
});
