import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PostDocument = HydratedDocument<Post>;

export enum PostStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

@Schema({ timestamps: true })
export class PostComment {
  _id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  authorId: Types.ObjectId;

  @Prop({ required: true, trim: true, minlength: 1, maxlength: 500 })
  content: string;
}

export const PostCommentSchema = SchemaFactory.createForClass(PostComment);

@Schema({ timestamps: true, collection: 'posts' })
export class Post {
  _id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  authorId: Types.ObjectId;

  @Prop({ required: true, trim: true, minlength: 1 })
  title: string;

  @Prop({ required: true, minlength: 1 })
  body: string;

  @Prop({ type: Types.ObjectId, ref: 'Itinerary', default: undefined })
  itineraryId?: Types.ObjectId;

  @Prop({ type: String, enum: PostStatus, default: PostStatus.DRAFT, index: true })
  status: PostStatus;

  @Prop({
    type: [{ type: String, trim: true, maxlength: 30 }],
    default: [],
    validate: {
      validator: (tags: string[]) => Array.isArray(tags) && tags.length <= 5,
      message: 'A post can contain at most 5 tags',
    },
  })
  tags: string[];

  // Image URLs from P4 UploadsService (BLG-10 / GEN-08); attach via POST /posts/:id/images.
  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({
    type: [Types.ObjectId],
    ref: 'User',
    default: [],
    validate: {
      validator: (likes: Types.ObjectId[]) =>
        Array.isArray(likes) && new Set(likes.map(String)).size === likes.length,
      message: 'A user can like a post only once',
    },
  })
  likes: Types.ObjectId[];

  @Prop({ type: [PostCommentSchema], default: [] })
  comments: PostComment[];
}

export const PostSchema = SchemaFactory.createForClass(Post);
PostSchema.index({ status: 1, createdAt: -1, _id: -1 });
PostSchema.index({ authorId: 1, createdAt: -1 });
PostSchema.index({ status: 1, tags: 1, createdAt: -1 });
