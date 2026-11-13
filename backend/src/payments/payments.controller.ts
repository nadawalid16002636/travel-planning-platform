import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ApiErrors, CurrentUser, Public, Roles } from '../common/decorators.js';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe.js';
import { Role, type JwtUser } from '../common/roles.js';
import { CreatePaymentDto } from './dto/payment.dto.js';
import { PaymentsService } from './payments.service.js';
import type { BookingType } from './payments.types.js';

function bookingType(value: string): BookingType {
  if (value !== 'flight' && value !== 'hotel') {
    throw new BadRequestException('Booking type must be flight or hotel');
  }
  return value;
}

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Post('webhook')
  @ApiOperation({ summary: 'PAY-01: Stripe webhook. A booking is confirmed only after the PaymentIntent succeeds' })
  @ApiErrors([400, 'Invalid Stripe signature'])
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    if (!req.rawBody || !signature) throw new BadRequestException('Missing Stripe signature');
    return this.payments.handleWebhook(req.rawBody, signature);
  }

  @ApiCookieAuth()
  @Roles(Role.USER)
  @Post()
  @ApiOperation({ summary: 'PAY-01, PAY-02, PAY-04: start or reuse the Stripe PaymentIntent for a pending booking' })
  @ApiErrors(400, 401, 403, [404, 'Booking not found'], [409, 'Booking is not payable'])
  create(@CurrentUser() user: JwtUser, @Body() dto: CreatePaymentDto) {
    return this.payments.start(dto.bookingType, dto.bookingId, user.sub);
  }

  @ApiCookieAuth()
  @Roles(Role.USER)
  @Post(':id/retry')
  @ApiOperation({ summary: 'PAY-01: retry the same PaymentIntent until the hold expires' })
  @ApiErrors(401, 403, [404, 'Payment not found'], [409, 'Payment can no longer be retried'])
  retry(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.payments.retry(id, user.sub);
  }

  @ApiCookieAuth()
  @Get(':id')
  @ApiOperation({ summary: 'PAY-01, PAY-03: payment status, amount, currency and any refund' })
  @ApiErrors(401, 403, [404, 'Payment not found'])
  get(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.payments.getPayment(id, user.sub, user.role === Role.ADMIN);
  }
}

@ApiTags('Payments')
@ApiCookieAuth()
@Roles(Role.USER)
@Controller('bookings')
export class BookingPoliciesController {
  constructor(private readonly payments: PaymentsService) {}

  @Get(':type/:id/policies')
  @ApiOperation({ summary: 'PAY-02: provider policies that must be accepted before payment' })
  @ApiErrors(400, 401, 403, [404, 'Booking not found'])
  policies(
    @CurrentUser() user: JwtUser,
    @Param('type') type: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.payments.policies(bookingType(type), id, user.sub);
  }

  @Post(':type/:id/accept-policies')
  @ApiOperation({ summary: 'PAY-02: record policy acceptance. Payment stays blocked until this exists' })
  @ApiErrors(400, 401, 403, [404, 'Booking not found'], [409, 'Booking is not awaiting payment'])
  accept(
    @CurrentUser() user: JwtUser,
    @Param('type') type: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.payments.acceptPolicies(bookingType(type), id, user.sub);
  }
}

@ApiTags('Payments')
@ApiCookieAuth()
@Controller('refunds')
export class RefundsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'PAY-03: refund status (Pending, Refunded or Failed)' })
  @ApiErrors(401, 403, [404, 'Refund not found'])
  get(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.payments.getRefund(id, user.sub, user.role === Role.ADMIN);
  }
}
