import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UsersService } from '../users/users.service.js';
import { ItinerariesService } from '../itineraries/itineraries.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import type { JwtUser } from '../common/roles.js';
import { AttachItineraryToPostDto, CreatePostCommentDto, CreatePostDto, MyPostsQueryDto, PostBrowseQueryDto, PostCommentsQueryDto, PostSearchQueryDto, UpdatePostCommentDto, UpdatePostDto } from './dto/post.dto.js';
import { Post, PostDocument, PostStatus } from './post.schema.js';

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<PostDocument>,
    private readonly users: UsersService,
    private readonly itineraries: ItinerariesService,
    private readonly uploads: UploadsService,
  ) {}

  async create(dto: CreatePostDto, user: JwtUser) {
    const tags = this.normalizeTags(dto.tags ?? []);
    const post = new this.postModel({
      authorId: new Types.ObjectId(user.sub),
      title: dto.title.trim(),
      body: dto.body,
      status: dto.status ?? PostStatus.DRAFT,
      tags,
      images: [],
      likes: [],
      comments: [],
    });
    const saved = await post.save();
    return this.toOwnerResponse(saved);
  }

  async browsePublished(query: PostBrowseQueryDto) {
    const filter: Record<string, unknown> = { status: PostStatus.PUBLISHED };
    if (query.tag?.trim()) filter.tags = this.normalizeTag(query.tag);
    const [posts, total] = await Promise.all([
      this.postModel
        .find(filter)
        .select('authorId title body status tags images likes comments createdAt updatedAt')
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .exec(),
      this.postModel.countDocuments(filter).exec(),
    ]);
    return this.paginated(await this.toCards(posts), total, query);
  }

  async searchPublished(query: PostSearchQueryDto) {
    const stages: Record<string, unknown>[] = [
      { $match: { status: PostStatus.PUBLISHED } },
      {
        $addFields: {
          likeCount: { $size: { $ifNull: ['$likes', []] } },
          commentCount: { $size: { $ifNull: ['$comments', []] } },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'authorId',
          foreignField: '_id',
          as: 'author',
        },
      },
      { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          authorName: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ['$author.firstName', ''] },
                  ' ',
                  { $ifNull: ['$author.lastName', ''] },
                ],
              },
            },
          },
        },
      },
    ];
    if (query.tag?.trim()) stages.push({ $match: { tags: this.normalizeTag(query.tag) } });
    if (query.keyword?.trim()) {
      const regex = new RegExp(escapeRegex(query.keyword.trim()), 'i');
      stages.push({
        $match: {
          $or: [
            { title: regex },
            { tags: regex },
            { authorName: regex },
          ],
        },
      });
    }
    stages.push(
      {
        $addFields: {
          interactionScore: { $add: ['$likeCount', '$commentCount'] },
        },
      },
      {
        $facet: {
          data: [
            { $sort: { interactionScore: -1, createdAt: -1, _id: -1 } },
            { $skip: (query.page - 1) * query.limit },
            { $limit: query.limit },
            {
              $project: {
                _id: 1,
                title: 1,
                tags: 1,
                createdAt: 1,
                likeCount: 1,
                commentCount: 1,
                interactionScore: 1,
                excerpt: { $substrCP: ['$body', 0, 240] },
                author: { id: '$author._id', name: '$authorName' },
              },
            },
          ],
          total: [{ $count: 'value' }],
        },
      },
    );

    const [result] = await this.postModel.aggregate(stages as any);
    const data = (result?.data ?? []).map((post: any) => ({
      id: String(post._id),
      title: post.title,
      excerpt: post.excerpt,
      tags: post.tags ?? [],
      createdAt: post.createdAt,
      author: post.author?.id
        ? { id: String(post.author.id), name: post.author.name }
        : null,
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      interactionScore: post.interactionScore,
    }));
    const total = result?.total?.[0]?.value ?? 0;
    return {
      data,
      page: query.page,
      limit: query.limit,
      total,
      ...(total === 0 ? { message: 'no results' } : {}),
    };
  }

  async listMine(query: MyPostsQueryDto, user: JwtUser) {
    const filter: Record<string, unknown> = { authorId: new Types.ObjectId(user.sub) };
    if (query.status) filter.status = query.status;
    if (query.tag?.trim()) filter.tags = this.normalizeTag(query.tag);
    const [posts, total] = await Promise.all([
      this.postModel
        .find(filter)
        .select('title status createdAt updatedAt likes comments')
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .exec(),
      this.postModel.countDocuments(filter).exec(),
    ]);
    return {
      data: posts.map((post: any) => ({
        id: String(post._id),
        title: post.title,
        status: post.status,
        date: post.createdAt,
        likeCount: post.likes?.length ?? 0,
        commentCount: post.comments?.length ?? 0,
      })),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async postPage(id: string, commentsQuery: PostCommentsQueryDto, user?: JwtUser) {
    const postId = this.parseId(id, 'post');
    const post: any = await this.postModel.findById(postId).exec();
    if (!post) throw new NotFoundException('Post not found');
    if (post.status !== PostStatus.PUBLISHED && (!user || String(post.authorId) !== user.sub)) {
      throw new NotFoundException('Post not found');
    }
    const author = await this.users.findById(String(post.authorId));
    const sortedComments = [...(post.comments ?? [])].sort((left: any, right: any) => {
      const byDate = new Date(left.createdAt ?? 0).getTime() - new Date(right.createdAt ?? 0).getTime();
      return byDate || String(left._id).localeCompare(String(right._id));
    });
    const pageComments = sortedComments.slice(
      (commentsQuery.page - 1) * commentsQuery.limit,
      commentsQuery.page * commentsQuery.limit,
    );
    const commentAuthors = await this.users.basicInfo([...new Set(pageComments.map((comment: any) => String(comment.authorId))) ]);
    const authorById = new Map(commentAuthors.map((item: any) => [item.id, item.name]));
    const attachedItinerary = post.itineraryId
      ? await this.itineraries.findPublicSummaryById(String(post.itineraryId))
      : null;
    return {
      id: String(post._id),
      title: post.title,
      body: post.body,
      status: post.status,
      tags: post.tags ?? [],
      images: post.images ?? [],
      author: { id: String(author._id), name: `${author.firstName ?? ''} ${author.lastName ?? ''}`.trim() },
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      likeCount: post.likes?.length ?? 0,
      commentCount: post.comments?.length ?? 0,
      comments: pageComments.map((comment: any) => ({
        id: String(comment._id),
        content: comment.content,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        author: {
          id: String(comment.authorId),
          name: authorById.get(String(comment.authorId)) ?? 'Unknown author',
        },
      })),
      commentsPage: commentsQuery.page,
      commentsLimit: commentsQuery.limit,
      ...(attachedItinerary ? { itinerary: attachedItinerary } : {}),
    };
  }

  async update(id: string, dto: UpdatePostDto, user: JwtUser) {
    if (!dto || !Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException('At least one post field must be supplied');
    }
    const post: any = await this.getOwnedPost(id, user);
    if (dto.title !== undefined) post.title = dto.title.trim();
    if (dto.body !== undefined) post.body = dto.body;
    if (dto.status !== undefined) post.status = dto.status;
    if (dto.tags !== undefined) post.tags = this.normalizeTags(dto.tags);
    return this.toOwnerResponse(await post.save());
  }

  async attachItinerary(id: string, dto: AttachItineraryToPostDto, user: JwtUser) {
    const post: any = await this.getOwnedPost(id, user);
    const itineraryId = this.parseId(dto?.itineraryId, 'itinerary');
    await this.itineraries.findOne(String(itineraryId), user);
    post.itineraryId = itineraryId;
    return this.toOwnerResponse(await post.save());
  }

  async detachItinerary(id: string, user: JwtUser) {
    const post: any = await this.getOwnedPost(id, user);
    post.itineraryId = undefined;
    return this.toOwnerResponse(await post.save());
  }

  async delete(id: string, user: JwtUser) {
    const postId = this.parseId(id, 'post');
    const post: any = await this.postModel.findById(postId).exec();
    if (!post) throw new NotFoundException('Post not found');
    if (String(post.authorId) !== user.sub) throw new ForbiddenException('You do not own this post');
    const result = await this.postModel.deleteOne({ _id: postId, authorId: new Types.ObjectId(user.sub) }).exec();
    if (result.deletedCount !== 1) throw new NotFoundException('Post not found');
    return { deleted: true, id: String(postId) };
  }

  async addComment(id: string, dto: CreatePostCommentDto, user: JwtUser) {
    const post = await this.findPublished(id);
    const content = dto.content.trim();
    if (!content || content.length > 500) throw new BadRequestException('Comment must contain 1 to 500 characters');
    post.comments.push({ authorId: new Types.ObjectId(user.sub), content } as any);
    await post.save();
    const created: any = post.comments[post.comments.length - 1];
    const author = await this.users.findById(user.sub);
    return {
      id: String(created._id),
      content: created.content,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      author: { id: String(author._id), name: `${author.firstName ?? ''} ${author.lastName ?? ''}`.trim() },
    };
  }

  async updateComment(id: string, commentId: string, dto: UpdatePostCommentDto, user: JwtUser) {
    const post = await this.findPublished(id);
    const target = this.findComment(post, commentId);
    if (String(target.authorId) !== user.sub) throw new ForbiddenException('You do not own this comment');
    const content = dto.content.trim();
    if (!content || content.length > 500) throw new BadRequestException('Comment must contain 1 to 500 characters');
    target.content = content;
    if (typeof target.markModified === 'function') target.markModified('content');
    await post.save();
    return { updated: true, id: String(target._id), content: target.content, updatedAt: target.updatedAt };
  }

  async deleteComment(id: string, commentId: string, user: JwtUser) {
    const post = await this.findPublished(id);
    const target: any = this.findComment(post, commentId);
    if (String(target.authorId) !== user.sub) throw new ForbiddenException('You do not own this comment');
    if (typeof target.deleteOne === 'function') target.deleteOne();
    else post.comments.splice(post.comments.indexOf(target), 1);
    await post.save();
    return { deleted: true, id: this.parseId(commentId, 'comment').toString() };
  }

  async like(id: string, user: JwtUser) {
    const postId = this.parseId(id, 'post');
    const post: any = await this.postModel.findOneAndUpdate(
      { _id: postId, status: PostStatus.PUBLISHED },
      { $addToSet: { likes: new Types.ObjectId(user.sub) } },
      { new: true },
    ).exec();
    if (!post) throw new NotFoundException('Published post not found');
    return { postId: String(post._id), liked: true, likeCount: post.likes?.length ?? 0 };
  }

  async unlike(id: string, user: JwtUser) {
    const postId = this.parseId(id, 'post');
    const post: any = await this.postModel.findOneAndUpdate(
      { _id: postId, status: PostStatus.PUBLISHED },
      { $pull: { likes: new Types.ObjectId(user.sub) } },
      { new: true },
    ).exec();
    if (!post) throw new NotFoundException('Published post not found');
    return { postId: String(post._id), liked: false, likeCount: post.likes?.length ?? 0 };
  }

  /** BLG-10 / GEN-08: attach an uploaded image to an owned post (max 5). */
  async addImage(id: string, file: Express.Multer.File, user: JwtUser) {
    const post: any = await this.getOwnedPost(id, user);
    const images: string[] = post.images ?? (post.images = []);
    if (images.length >= 5) throw new BadRequestException('This post already has 5 images');
    const stored = await this.uploads.validateAndStore(file, {
      purpose: 'post',
      entityId: String(post._id),
      user,
    });
    images.push(stored.url);
    await post.save();
    return { id: stored.id, url: stored.url, images };
  }

  /** BLG-10: remove an owned post image by upload id. */
  async removeImage(id: string, imageId: string, user: JwtUser) {
    const post: any = await this.getOwnedPost(id, user);
    const upload = await this.uploads.get(imageId);
    if (upload.purpose !== 'post' || upload.entityId !== String(post._id)) {
      throw new NotFoundException('Image not found on this post');
    }
    const images: string[] = post.images ?? [];
    const index = images.indexOf(upload.url);
    if (index < 0) throw new NotFoundException('Image not found on this post');
    images.splice(index, 1);
    post.images = images;
    await post.save();
    await this.uploads.remove(imageId, user);
    return { deleted: true, id: imageId, images };
  }

  async authorPage(authorId: string, query: MyPostsQueryDto) {
    const id = this.parseId(authorId, 'author');
    const author = await this.users.findById(id.toString());
    const [posts, itineraries] = await Promise.all([
      this.listPublishedByAuthor(id, query),
      this.itineraries.findPublicByAuthor(id.toString(), query.page, query.limit),
    ]);
    return {
      author: {
        id: String(author._id),
        name: `${author.firstName ?? ''} ${author.lastName ?? ''}`.trim(),
        joinedAt: (author as any).createdAt,
      },
      posts,
      itineraries,
    };
  }

  private async listPublishedByAuthor(authorId: Types.ObjectId, query: MyPostsQueryDto) {
    const filter = { authorId, status: PostStatus.PUBLISHED };
    const [posts, total] = await Promise.all([
      this.postModel.find(filter)
        .select('authorId title body tags images likes comments createdAt updatedAt')
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .exec(),
      this.postModel.countDocuments(filter).exec(),
    ]);
    return this.paginated(await this.toCards(posts), total, query);
  }

  private async toCards(posts: any[]) {
    const authorIds = [...new Set(posts.map((post) => String(post.authorId)))];
    const authors = await this.users.basicInfo(authorIds);
    const nameById = new Map(authors.map((author: any) => [author.id, author.name]));
    return posts.map((post) => ({
      id: String(post._id),
      title: post.title,
      excerpt: String(post.body ?? '').slice(0, 240),
      tags: post.tags ?? [],
      images: post.images ?? [],
      createdAt: post.createdAt,
      author: { id: String(post.authorId), name: nameById.get(String(post.authorId)) ?? 'Unknown author' },
      likeCount: post.likes?.length ?? 0,
      commentCount: post.comments?.length ?? 0,
      interactionScore: (post.likes?.length ?? 0) + (post.comments?.length ?? 0),
    }));
  }

  private paginated<T>(data: T[], total: number, query: { page: number; limit: number }) {
    return { data, page: query.page, limit: query.limit, total };
  }

  private async getOwnedPost(id: string, user: JwtUser) {
    const postId = this.parseId(id, 'post');
    const post: any = await this.postModel.findById(postId).exec();
    if (!post) throw new NotFoundException('Post not found');
    if (String(post.authorId) !== user.sub) throw new ForbiddenException('You do not own this post');
    return post as PostDocument;
  }

  private async findPublished(id: string) {
    const post = await this.postModel.findOne({
      _id: this.parseId(id, 'post'),
      status: PostStatus.PUBLISHED,
    }).exec();
    if (!post) throw new NotFoundException('Published post not found');
    return post;
  }

  private findComment(post: PostDocument, commentId: string) {
    const id = this.parseId(commentId, 'comment').toString();
    const comment: any = post.comments.find((entry: any) => String(entry._id) === id);
    if (!comment) throw new NotFoundException('Comment not found');
    return comment;
  }

  private parseId(value: string, label: string) {
    if (!Types.ObjectId.isValid(value)) throw new BadRequestException(`Invalid ${label} ID`);
    return new Types.ObjectId(value);
  }

  private normalizeTag(tag: string) {
    return tag.trim().toLocaleLowerCase('en-US');
  }

  private normalizeTags(tags: string[]) {
    if (!Array.isArray(tags) || tags.length > 5) throw new BadRequestException('A post can contain at most 5 tags');
    const normalized = tags.map((tag) => {
      if (typeof tag !== 'string' || !tag.trim() || tag.trim().length > 30) {
        throw new BadRequestException('Each tag must contain 1 to 30 characters');
      }
      return this.normalizeTag(tag);
    });
    return [...new Set(normalized)];
  }

  private toOwnerResponse(post: any) {
    return {
      id: String(post._id),
      authorId: String(post.authorId),
      title: post.title,
      body: post.body,
      status: post.status,
      tags: post.tags ?? [],
      images: post.images ?? [],
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      likeCount: post.likes?.length ?? 0,
      commentCount: post.comments?.length ?? 0,
      ...(post.itineraryId ? { itineraryId: String(post.itineraryId) } : {}),
    };
  }
}
