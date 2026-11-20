import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ReportsService } from './reports.service.js';

// GEN-09, GEN-10: comments are stored inside their post (posts.comments), not in their own collection
describe('ReportsService comments', () => {
  const commentId = new Types.ObjectId();
  const posts = {
    findOne: vi.fn(),
    updateOne: vi.fn(),
  };
  const connection = { collection: vi.fn().mockReturnValue(posts) };
  const reports = { create: vi.fn(), findById: vi.fn(), updateMany: vi.fn() };
  const moderation = { findOneAndUpdate: vi.fn() };
  const audit = { log: vi.fn() };
  let service: ReportsService;

  beforeEach(() => {
    vi.clearAllMocks();
    connection.collection.mockReturnValue(posts);
    service = new ReportsService(connection as any, reports as any, moderation as any, {} as any, audit as any);
  });

  it('lets a user report a comment that exists inside a post', async () => {
    posts.findOne.mockResolvedValue({ _id: new Types.ObjectId() });
    reports.create.mockResolvedValue({ _id: 'r1' });
    await service.create('u1', { targetType: 'comment', targetId: String(commentId), reason: ' spam ' } as any);
    expect(connection.collection).toHaveBeenCalledWith('posts');
    expect(posts.findOne).toHaveBeenCalledWith({ 'comments._id': commentId });
    expect(reports.create).toHaveBeenCalledWith(expect.objectContaining({ targetType: 'comment', reason: 'spam' }));
  });

  it('rejects a report for a comment that does not exist', async () => {
    posts.findOne.mockResolvedValue(null);
    await expect(
      service.create('u1', { targetType: 'comment', targetId: String(commentId), reason: 'spam' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(reports.create).not.toHaveBeenCalled();
  });

  it('hides a comment inside its post', async () => {
    posts.findOne.mockResolvedValue({ _id: new Types.ObjectId() });
    posts.updateOne.mockResolvedValue({ matchedCount: 1 });
    await service.moderate('comment', String(commentId), 'admin', { action: 'hide' } as any);
    expect(posts.updateOne).toHaveBeenCalledWith({ 'comments._id': commentId }, { $set: { 'comments.$.hidden': true } });
    expect(moderation.findOneAndUpdate).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith('admin', 'CONTENT_HIDE', 'comment', String(commentId));
  });

  it('deletes a comment from its post', async () => {
    posts.findOne.mockResolvedValue({ _id: new Types.ObjectId() });
    posts.updateOne.mockResolvedValue({ matchedCount: 1 });
    await service.moderate('comment', String(commentId), 'admin', { action: 'delete' } as any);
    expect(posts.updateOne).toHaveBeenCalledWith({ 'comments._id': commentId }, { $pull: { comments: { _id: commentId } } });
  });
});
