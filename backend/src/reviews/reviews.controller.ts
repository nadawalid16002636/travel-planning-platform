import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiErrors, CurrentUser, Public, Roles } from '../common/decorators.js';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe.js';
import { Role } from '../common/roles.js';
import type { JwtUser } from '../common/roles.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { ReviewQueryDto } from './dto/review-query.dto.js';
import { UpdateReviewDto } from './dto/update-review.dto.js';
import { ReviewsService } from './reviews.service.js';

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get('hotels/:hotelId/reviews')
  @ApiErrors(400, [404, 'Hotel not found'])
  findForHotel(
    @Param('hotelId', ParseObjectIdPipe) hotelId: string,
    @Query() query: ReviewQueryDto,
    @CurrentUser() viewer?: JwtUser,
  ) {
    return this.reviews.findForHotel(hotelId, query, viewer);
  }

  @Roles(Role.USER)
  @Post('hotel-bookings/:bookingId/review')
  @ApiErrors(
    400,
    401,
    403,
    [404, 'Hotel booking not found'],
    [409, 'Review not eligible or already submitted'],
  )
  create(
    @Param('bookingId', ParseObjectIdPipe) bookingId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.create(bookingId, user, dto);
  }

  @Roles(Role.USER)
  @Patch('reviews/:id')
  @ApiErrors(400, 401, 403, [404, 'Review not found'])
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviews.update(id, user, dto);
  }

  @Roles(Role.USER)
  @Delete('reviews/:id')
  @ApiErrors(400, 401, 403, [404, 'Review not found'])
  remove(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reviews.remove(id, user);
  }
}
