import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiErrors, CurrentUser, Public } from '../common/decorators.js';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe.js';
import { MAX_IMAGE_BYTES } from '../uploads/upload.rules.js';
import type { JwtUser } from '../common/roles.js';
import {
  AttachItineraryToPostDto,
  CreatePostCommentDto,
  CreatePostDto,
  MyPostsQueryDto,
  PaginatedPostsDto,
  PostAuthorPageQueryDto,
  PostBrowseQueryDto,
  PostCommentsQueryDto,
  PostPageDto,
  PostSearchQueryDto,
  PublicAuthorPageDto,
  UpdatePostCommentDto,
  UpdatePostDto,
} from './dto/post.dto.js';
import { PostsService } from './posts.service.js';

@Controller('posts')
@ApiTags('Posts / Travel Blog')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Post()
  @ApiOperation({ summary: 'BLG-01: Create a draft or published post' })
  @ApiBody({ type: CreatePostDto, description: 'Author is taken from the authenticated account. Attach images afterwards with POST /api/posts/:id/images (BLG-10 / GEN-08).' })
  @ApiCreatedResponse({ type: PostPageDto })
  @ApiErrors(400, 401)
  create(@Body() dto: CreatePostDto, @CurrentUser() user: JwtUser) {
    return this.posts.create(dto, user);
  }

  @Get('search')
  @Public()
  @ApiOperation({ summary: 'BLG-09: Search published posts by title, tag, or author name' })
  @ApiOkResponse({ type: PaginatedPostsDto, description: 'Ordered by interaction score (likes + comments), then newest first; empty results return message "no results".' })
  @ApiErrors(400)
  search(@Query() query: PostSearchQueryDto) {
    return this.posts.searchPublished(query);
  }

  @Get('authors/:authorId')
  @Public()
  @ApiOperation({ summary: 'BLG-12: Public author page' })
  @ApiParam({ name: 'authorId', description: 'User ObjectId.' })
  @ApiOkResponse({ type: PublicAuthorPageDto, description: 'Contains the author name and join date, published posts, and public itineraries only.' })
  @ApiErrors(400, [404, 'Author not found'])
  authorPage(
    @Param('authorId', ParseObjectIdPipe) authorId: string,
    @Query() query: PostAuthorPageQueryDto,
  ) {
    return this.posts.authorPage(authorId, query);
  }

  @Get('mine')
  @ApiOperation({ summary: 'BLG-03: List the authenticated user’s posts, including drafts' })
  @ApiOkResponse({ type: PaginatedPostsDto })
  @ApiErrors(400, 401)
  mine(@Query() query: MyPostsQueryDto, @CurrentUser() user: JwtUser) {
    return this.posts.listMine(query, user);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'BLG-02, BLG-08: Browse published posts, optionally filtered by tag' })
  @ApiOkResponse({ type: PaginatedPostsDto })
  @ApiErrors(400)
  browse(@Query() query: PostBrowseQueryDto) {
    return this.posts.browsePublished(query);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'BLG-02: Read a published post page with paginated comments' })
  @ApiParam({ name: 'id', description: 'Post ObjectId.' })
  @ApiOkResponse({ type: PostPageDto })
  @ApiErrors(400, [404, 'Published post not found; an owner may read their own draft'])
  postPage(
    @Param('id', ParseObjectIdPipe) id: string,
    @Query() query: PostCommentsQueryDto,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.posts.postPage(id, query, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'BLG-04, BLG-08: Edit an owned post' })
  @ApiBody({ type: UpdatePostDto })
  @ApiOkResponse({ type: PostPageDto })
  @ApiErrors(400, 401, 403, [404, 'Post not found'])
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdatePostDto, @CurrentUser() user: JwtUser) {
    return this.posts.update(id, dto, user);
  }

  @Patch(':id/itinerary')
  @ApiOperation({ summary: 'BLG-13: Attach an itinerary owned by the post author' })
  @ApiBody({ type: AttachItineraryToPostDto })
  @ApiOkResponse({ type: PostPageDto, description: 'Public post details expose only the attached itinerary summary while the itinerary remains public. Private or deleted itineraries are omitted.' })
  @ApiErrors(400, 401, 403, [404, 'Post or owned itinerary not found'])
  attachItinerary(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: AttachItineraryToPostDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.posts.attachItinerary(id, dto, user);
  }

  @Delete(':id/itinerary')
  @ApiOperation({ summary: 'BLG-13: Detach an itinerary without deleting it' })
  @ApiOkResponse({ type: PostPageDto })
  @ApiErrors(400, 401, 403, [404, 'Post not found'])
  detachItinerary(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: JwtUser) {
    return this.posts.detachItinerary(id, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'BLG-04: Delete an owned post' })
  @ApiOkResponse({ schema: { example: { deleted: true, id: '64b000000000000000000002' } } })
  @ApiErrors(400, 401, 403, [404, 'Post not found'])
  delete(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: JwtUser) {
    return this.posts.delete(id, user);
  }

  @Post(':id/images')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'BLG-10, GEN-08: Attach a JPG/PNG image to an owned post (max 5)' })
  @ApiOkResponse({ schema: { example: { id: '64b000000000000000000010', url: 'http://localhost:3000/api/uploads/files/abc.jpg', images: ['http://localhost:3000/api/uploads/files/abc.jpg'] } } })
  @ApiErrors(400, 401, 403, [404, 'Post not found'])
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  addImage(
    @Param('id', ParseObjectIdPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtUser,
  ) {
    if (!file) throw new BadRequestException('Choose a JPG or PNG image');
    return this.posts.addImage(id, file, user);
  }

  @Delete(':id/images/:imageId')
  @ApiOperation({ summary: 'BLG-10: Remove an image from an owned post' })
  @ApiParam({ name: 'imageId', description: 'Upload ObjectId returned when the image was attached.' })
  @ApiOkResponse({ schema: { example: { deleted: true, id: '64b000000000000000000010', images: [] } } })
  @ApiErrors(400, 401, 403, [404, 'Post or image not found'])
  removeImage(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('imageId', ParseObjectIdPipe) imageId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.posts.removeImage(id, imageId, user);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'BLG-05: Comment on a published post' })
  @ApiBody({ type: CreatePostCommentDto })
  @ApiCreatedResponse({ schema: { example: { id: '64b000000000000000000003', content: 'Great post!', author: { id: '64b000000000000000000001', name: 'Alex Morgan' } } } })
  @ApiErrors(400, 401, [404, 'Published post not found'])
  addComment(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: CreatePostCommentDto, @CurrentUser() user: JwtUser) {
    return this.posts.addComment(id, dto, user);
  }

  @Put(':id/like')
  @ApiOperation({ summary: 'BLG-06: Like a published post once' })
  @ApiOkResponse({ schema: { example: { postId: '64b000000000000000000002', liked: true, likeCount: 4 } } })
  @ApiErrors(400, 401, [404, 'Published post not found'])
  like(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: JwtUser) {
    return this.posts.like(id, user);
  }

  @Delete(':id/like')
  @ApiOperation({ summary: 'BLG-06: Remove the authenticated user’s like' })
  @ApiOkResponse({ schema: { example: { postId: '64b000000000000000000002', liked: false, likeCount: 3 } } })
  @ApiErrors(400, 401, [404, 'Published post not found'])
  unlike(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: JwtUser) {
    return this.posts.unlike(id, user);
  }

  @Patch(':id/comments/:commentId')
  @ApiOperation({ summary: 'BLG-07: Edit an owned comment' })
  @ApiParam({ name: 'commentId', description: 'Comment subdocument ObjectId.' })
  @ApiBody({ type: UpdatePostCommentDto })
  @ApiOkResponse({ schema: { example: { updated: true, id: '64b000000000000000000003', content: 'Edited comment' } } })
  @ApiErrors(400, 401, 403, [404, 'Post or comment not found'])
  updateComment(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('commentId', ParseObjectIdPipe) commentId: string,
    @Body() dto: UpdatePostCommentDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.posts.updateComment(id, commentId, dto, user);
  }

  @Delete(':id/comments/:commentId')
  @ApiOperation({ summary: 'BLG-07: Delete an owned comment' })
  @ApiParam({ name: 'commentId', description: 'Comment subdocument ObjectId.' })
  @ApiOkResponse({ schema: { example: { deleted: true, id: '64b000000000000000000003' } } })
  @ApiErrors(400, 401, 403, [404, 'Post or comment not found'])
  deleteComment(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('commentId', ParseObjectIdPipe) commentId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.posts.deleteComment(id, commentId, user);
  }
}
