import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.dto.js';
import { PostStatus } from '../post.schema.js';

export class CreatePostDto {
  @ApiProperty({ example: 'A weekend in Cairo' })
  @IsString()
  @Matches(/\S/)
  title: string;

  @ApiProperty({ example: 'We explored the old city and visited the museum...' })
  @IsString()
  @Matches(/\S/)
  body: string;

  @ApiPropertyOptional({ enum: PostStatus, default: PostStatus.DRAFT })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(Object.values(PostStatus))
  status?: PostStatus;

  @ApiPropertyOptional({ type: [String], maxItems: 5, maxLength: 30, example: ['cairo', 'history'] })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  @Matches(/\S/, { each: true })
  tags?: string[];
}

export class UpdatePostDto {
  @ApiPropertyOptional({ example: 'A weekend in Cairo' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/\S/)
  title?: string;

  @ApiPropertyOptional({ example: 'Updated travel story...' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/\S/)
  body?: string;

  @ApiPropertyOptional({ enum: PostStatus })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(Object.values(PostStatus))
  status?: PostStatus;

  @ApiPropertyOptional({ type: [String], maxItems: 5, maxLength: 30 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  @Matches(/\S/, { each: true })
  tags?: string[];
}

export class PostBrowseQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ maxLength: 30 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(30)
  tag?: string;
}

export class PostSearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ maxLength: 100, description: 'Matches published post title, tags, or author name.' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @ApiPropertyOptional({ maxLength: 30, description: 'Exact normalized tag filter.' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(30)
  tag?: string;
}

export class MyPostsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PostStatus })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(Object.values(PostStatus))
  status?: PostStatus;

  @ApiPropertyOptional({ maxLength: 30 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(30)
  tag?: string;
}

export class PostCommentsQueryDto extends PaginationQueryDto {}

export class CreatePostCommentDto {
  @ApiProperty({ maxLength: 500, example: 'Thanks for sharing this itinerary!' })
  @IsString()
  @Matches(/\S/)
  @MaxLength(500)
  content: string;
}

export class UpdatePostCommentDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @Matches(/\S/)
  @MaxLength(500)
  content: string;
}

export class AttachItineraryToPostDto {
  @ApiProperty({ example: '64b000000000000000000021' })
  @IsString()
  @Matches(/^[a-fA-F0-9]{24}$/)
  itineraryId: string;
}

export class PostAuthorPageQueryDto extends PaginationQueryDto {}

export class PostPageDto {
  @ApiProperty({ example: '64b000000000000000000002' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  @ApiProperty({ enum: PostStatus })
  status: PostStatus;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiProperty({ type: [String] })
  images: string[];

  @ApiProperty({ type: Object })
  author: { id: string; name: string };

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;

  @ApiProperty({ minimum: 0 })
  likeCount: number;

  @ApiProperty({ minimum: 0 })
  commentCount: number;

  @ApiPropertyOptional({ example: '64b000000000000000000021' })
  itineraryId?: string;

  @ApiPropertyOptional({ type: Object, description: 'Only a public summary is included; private, missing, or unpublished itineraries are omitted.' })
  itinerary?: Record<string, unknown>;

  @ApiProperty({ type: [Object] })
  comments: Array<Record<string, unknown>>;
}

export class PaginatedPostsDto {
  @ApiProperty({ type: [Object] })
  data: Array<Record<string, unknown>>;

  @ApiProperty({ minimum: 1 })
  page: number;

  @ApiProperty({ minimum: 1, maximum: 100 })
  limit: number;

  @ApiProperty({ minimum: 0 })
  total: number;

  @ApiPropertyOptional({ example: 'no results' })
  message?: string;
}

export class PublicAuthorPageDto {
  @ApiProperty({ type: Object })
  author: { id: string; name: string; joinedAt: Date };

  @ApiProperty({ type: PaginatedPostsDto })
  posts: PaginatedPostsDto;

  @ApiProperty({ type: Object })
  itineraries: Record<string, unknown>;
}
