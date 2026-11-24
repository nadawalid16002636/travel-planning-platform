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
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors, CurrentUser, Public, Roles } from '../common/decorators.js';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe.js';
import { Role } from '../common/roles.js';
import type { JwtUser } from '../common/roles.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { ReviewQueryDto } from './dto/review-query.dto.js';
import { UpdateReviewDto } from './dto/update-review.dto.js';
import { ReviewsService } from './reviews.service.js';

@ApiTags('Hotel reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Roles(Role.USER)
  @Get('hotel-bookings/:bookingId/review')
  @ApiErrors(400, 401, 403, [404, 'Hotel booking not found'])
  findForBooking(
    @Param('bookingId', ParseObjectIdPipe) bookingId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reviews.findForBooking(bookingId, user);
  }

  @Public()
  @ApiOperation({ summary: 'HTL-24, ACC-12: average rating, rating count and reviews of a hotel (deactivated authors shown as Deleted user)' })
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
  @ApiCookieAuth()
  @ApiOperation({ summary: 'HTL-23: review a Completed stay (one review per reservation)' })
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
  @ApiCookieAuth()
  @ApiOperation({ summary: 'HTL-23: edit my review' })
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
  @ApiCookieAuth()
  @ApiOperation({ summary: 'HTL-23: delete my review' })
  @Delete('reviews/:id')
  @ApiErrors(400, 401, 403, [404, 'Review not found'])
  remove(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reviews.remove(id, user);
  }
}
