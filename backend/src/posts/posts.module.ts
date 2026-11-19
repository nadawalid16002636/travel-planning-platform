// Owner: P5. Add your schemas, DTOs, controller and service in this folder.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module.js';
import { ItinerariesModule } from '../itineraries/itineraries.module.js';
import { Post, PostSchema } from './post.schema.js';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';

@Module({
  imports: [
    UsersModule,
    ItinerariesModule,
    MongooseModule.forFeature([{ name: Post.name, schema: PostSchema }]),
  ],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
