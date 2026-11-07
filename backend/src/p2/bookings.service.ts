import PDFDocument from 'pdfkit';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import { randomBytes } from 'crypto';
import { P2Access, P2Principal, objectId } from './access.js';
import {
  BookingQueryDto,
  CreateBookingDto,
  HoldDto,
  PageDto,
  UpdateFlightDto,
} from './dto.js';
import { airportInstant, localDate, FlightsService } from './flights.service.js';
import { P2Rules } from './rules.js';
import { StreamableFile } from '@nestjs/common';
import { airportLocalTime } from './flights.service.js';

/** Only P4's server-side verified webhook handler may call applyVerifiedPayment. No HTTP success endpoint. */
export interface VerifiedFlightPayment {
  bookingId: string;
  paymentId: string;
  outcome: 'succeeded' | 'failed' | 'cancelled';
  amountMinor: number;
  currency: string;
}
@Injectable()
export class BookingsService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private sweeping = false;
  private readonly logger = new Logger(BookingsService.name);
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel('SeatHold') private readonly holds: Model<any>,
    @InjectModel('FlightBooking') private readonly bookings: Model<any>,
    @InjectModel('P2Event') private readonly events: Model<any>,
    private readonly flights: FlightsService,
    private readonly access: P2Access,
    private readonly rules: P2Rules,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.sweep(), 30000);
    this.timer.unref();
    void this.sweep();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async sweep() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      await this.expire();
    } catch {
      this.logger.error(
        'P2 inventory expiry failed; check database availability and transaction support',
      );
    } finally {
      this.sweeping = false;
    }
  }
  async transaction<T>(
    work: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(() => work(session));
    } finally {
      await session.endSession();
    }
  }
  private owned(record: any, user: P2Principal) {
    if (!record) throw new NotFoundException('Booking or hold not found');
    if (record.userId !== user.id)
      throw new ForbiddenException('Booking or hold belongs to another user');
    return record;
  }
  private async emit(
    kind: string,
    booking: any,
    payload: object,
    session: ClientSession,
  ) {
    await this.events.create(
      [{ kind, userId: booking.userId, bookingId: booking._id, payload }],
      { session },
    );
  }
  /** P4 polls and acknowledges these durable events with idempotent delivery keyed by event _id. */
  pendingEvents() {
    return this.events
      .find({ deliveredAt: null })
      .sort({ _id: 1 })
      .limit(100)
      .lean();
  }
  acknowledgeEvent(id: string) {
    return this.events.updateOne(
      { _id: objectId(id), deliveredAt: null },
      { $set: { deliveredAt: new Date() } },
    );
  }
  private refundAmount(b: any) {
    const outbound = b.legs[0];
    const remaining = outbound.departureAt.getTime() - Date.now();
    if (remaining <= 0)
      throw new ConflictException('Booking departure has passed');
    const days = Math.floor(remaining / 86400000);
    const tier = [...outbound.policySnapshot.cancellationPolicy.tiers]
      .sort((a, z) => z.daysBeforeDeparture - a.daysBeforeDeparture)
      .find((t) => t.daysBeforeDeparture <= days);
    return Math.floor((b.totalMinor * (tier?.refundPercent || 0)) / 100);
  }
  async cancellationQuote(id: string, user: P2Principal) {
    const b = await this.get(id, user);
    if (b.status !== 'confirmed')
      throw new ConflictException('Only Confirmed bookings can be cancelled');
    return {
      refundDueMinor: this.refundAmount(b),
      currency: b.currency,
      policy: b.legs[0].policySnapshot.cancellationPolicy,
    };
  }
  async updateSchedule(id: string, dto: UpdateFlightDto, user: P2Principal) {
    return this.transaction(async (session) => {
      const f = await this.flights.get(id, session);
      this.access.manage(user, String(f.airlineId));
      if (f.status !== 'scheduled' || f.departureAt <= new Date())
        throw new ConflictException('Only Scheduled flights can be edited');
      const departureAirport = dto.departureAirport || f.departureAirport;
      const arrivalAirport = dto.arrivalAirport || f.arrivalAirport;
      if (departureAirport === arrivalAirport)
        throw new BadRequestException('Airports must differ');
      const changedRoute =
        departureAirport !== f.departureAirport ||
        arrivalAirport !== f.arrivalAirport;
      if (
        changedRoute &&
        ((await this.bookings
          .exists({ 'legs.flightId': f._id })
          .session(session)) ||
          (await this.holds
            .exists({ 'legs.flightId': f._id, state: 'active' })
            .session(session)))
      )
        throw new ConflictException(
          'Airports cannot change after any booking or active hold',
        );
      const departure = await this.flights.airports.byCode(departureAirport);
      const arrival = await this.flights.airports.byCode(arrivalAirport);
      const departureAt = dto.departureAt
        ? airportInstant(dto.departureAt, departure.timeZone)
        : f.departureAt;
      const arrivalAt = dto.arrivalAt
        ? airportInstant(dto.arrivalAt, arrival.timeZone)
        : f.arrivalAt;
      this.flights.dates(departureAt, arrivalAt);
      const affected = await this.bookings
        .find({
          'legs.flightId': f._id,
          status: { $in: ['confirmed', 'pending-payment'] },
        })
        .session(session);
      const holds = await this.holds
        .find({ 'legs.flightId': f._id, state: 'active' })
        .session(session);
      for (const b of [...affected, ...holds]) {
        const legs = b.legs.map((l: any) =>
          String(l.flightId) === id
            ? { ...l.toObject(), departureAt, arrivalAt }
            : l.toObject(),
        );
        if (legs.length === 2 && legs[0].arrivalAt >= legs[1].departureAt)
          throw new ConflictException(
            'Schedule change breaks an existing round-trip itinerary',
          );
      }
      await this.flights.flights.updateOne(
        { _id: f._id },
        {
          $set: {
            departureAt,
            arrivalAt,
            departureAirport,
            arrivalAirport,
            departureTimeZone: departure.timeZone,
            arrivalTimeZone: arrival.timeZone,
            departureLocalDate: localDate(departureAt, departure.timeZone),
          },
          $inc: { revision: 1 },
        },
        { session },
      );
      for (const model of [this.bookings, this.holds])
        await model.updateMany(
          {
            'legs.flightId': f._id,
            ...(model === this.bookings
              ? { status: { $in: ['pending-payment', 'confirmed'] } }
              : { state: 'active' }),
          },
          {
            $set: {
              'legs.$[leg].departureAt': departureAt,
              'legs.$[leg].arrivalAt': arrivalAt,
            },
          },
          { session, arrayFilters: [{ 'leg.flightId': f._id }] },
        );
      for (const b of affected)
        if (b.status === 'confirmed')
          await this.emit(
            'flight-schedule-changed',
            b,
            { flightId: id, departureAt, arrivalAt },
            session,
          );
      return this.flights.get(id, session);
    });
  }
  private async release(record: any, session: ClientSession) {
    for (const leg of record.legs) {
      const result = await this.flights.flights.updateOne(
        {
          _id: leg.flightId,
          cabins: {
            $elemMatch: {
              cabinClass: leg.cabinClass,
              reserved: { $gte: record.seats },
            },
          },
        },
        { $inc: { 'cabins.$.reserved': -record.seats, revision: 1 } },
        { session },
      );
      if (result.modifiedCount !== 1)
        throw new ConflictException(
          'Inventory integrity check failed; manual reconciliation required',
        );
    }
  }
  async hold(dto: HoldDto, user: P2Principal) {
    this.access.customer(user);
    this.rules.validateSeatCount(dto.seats);
    await this.expire();
    return this.transaction(async (session) => {
      const legs = [];
      let previous: any;
      let first: any;
      for (const selected of dto.legs) {
        const f = await this.flights.get(selected.flightId, session);
        if (f.status !== 'scheduled' || f.departureAt <= new Date())
          throw new ConflictException('Flight is not bookable');
        if (
          previous &&
          (previous.arrivalAirport !== f.departureAirport ||
            previous.departureAirport !== f.arrivalAirport ||
            previous.arrivalAt >= f.departureAt)
        )
          throw new BadRequestException('Invalid round-trip legs');
        const c = f.cabins.find((c: any) => c.cabinClass === selected.cabinClass);
        if (!c) throw new BadRequestException('Cabin unavailable');
        if (first && first.currency !== c.currency)
          throw new BadRequestException(
            'Round-trip legs must use the same currency',
          );
        const reserved = await this.flights.flights.updateOne(
          {
            _id: f._id,
            revision: f.revision,
            status: 'scheduled',
            cabins: {
              $elemMatch: {
                cabinClass: selected.cabinClass,
                reserved: { $lte: c.capacity - dto.seats },
              },
            },
          },
          { $inc: { 'cabins.$.reserved': dto.seats, revision: 1 } },
          { session },
        );
        if (reserved.modifiedCount !== 1)
          throw new ConflictException(
            'Insufficient inventory or flight changed; retry search',
          );
        const policySnapshot = await this.flights.bookingPolicies(
          String(f.airlineId),
          session,
        );
        legs.push({
          ...selected,
          flightNumber: f.flightNumber,
          departureAirport: f.departureAirport,
          arrivalAirport: f.arrivalAirport,
          departureTimeZone: f.departureTimeZone,
          arrivalTimeZone: f.arrivalTimeZone,
          freeBags: c.freeBags,
          maxWeightKgPerBag: c.maxWeightKgPerBag,
          priceMinor: c.priceMinor,
          currency: c.currency,
          policySnapshot,
          departureAt: f.departureAt,
          arrivalAt: f.arrivalAt,
        });
        first = first || c;
        previous = f;
      }
      const [hold] = await this.holds.create(
        [
          {
            userId: user.id,
            legs,
            seats: dto.seats,
            state: 'active',
            expiresAt: new Date(Date.now() + 10 * 60000),
          },
        ],
        { session },
      );
      return hold;
    });
  }
  async create(dto: CreateBookingDto, user: P2Principal) {
    this.access.customer(user);
    if (dto.acceptedPolicies !== true)
      throw new BadRequestException('Airline policy acceptance required');
    return this.transaction(async (session) => {
      const hold: any = this.owned(
        await this.holds.findById(objectId(dto.holdId)).session(session).lean(),
        user,
      );
      if (hold.state !== 'active' || hold.expiresAt <= new Date())
        throw new ConflictException('Hold expired or already consumed');
      const outboundDate = new Date(
        localDate(hold.legs[0].departureAt, hold.legs[0].departureTimeZone) +
          'T00:00:00Z',
      );
      if (this.rules.validate(dto.passengers, outboundDate) !== hold.seats)
        throw new BadRequestException(
          'Passengers do not match held seat inventory',
        );
      for (const leg of hold.legs) {
        const f = await this.flights.get(String(leg.flightId), session);
        if (f.status !== 'scheduled' || f.departureAt <= new Date())
          throw new ConflictException('Flight no longer bookable');
        // Serialize against flight cancellation and schedule changes.
        await this.flights.flights.updateOne(
          { _id: f._id },
          { $inc: { revision: 1 } },
          { session },
        );
      }
      let fareMinor = 0;
      let baggageMinor = 0;
      for (const leg of hold.legs) {
        const baggage = leg.policySnapshot?.baggagePolicy;
        if (
          !baggage ||
          (dto.passengers.some((p: any) => p.extraBagWeightsKg?.length) &&
            baggage.currency !== leg.currency)
        )
          throw new ConflictException(
            'Baggage policy currency is incompatible',
          );
        for (const p of dto.passengers) {
          const bags = p.extraBagWeightsKg || [];
          if (
            bags.length > baggage.maxExtraBagsPerPassenger ||
            bags.some((w) => w > leg.maxWeightKgPerBag)
          )
            throw new BadRequestException(
              'Extra baggage exceeds airline bag count or cabin weight limits',
            );
          baggageMinor += bags.length * baggage.extraBagPriceMinor;
        }
        fareMinor += this.rules.fare(dto.passengers, leg.priceMinor);
      }
      const totalMinor = fareMinor + baggageMinor;
      if (!Number.isSafeInteger(totalMinor) || totalMinor < 0)
        throw new BadRequestException(
          'Booking total exceeds supported price range',
        );
      const result = await this.holds.updateOne(
        { _id: hold._id, state: 'active', expiresAt: { $gt: new Date() } },
        { $set: { state: 'consumed' } },
        { session },
      );
      if (result.modifiedCount !== 1)
        throw new ConflictException('Hold expired or already consumed');
      const [booking] = await this.bookings.create(
        [
          {
            reference: 'FLT-' + randomBytes(12).toString('hex').toUpperCase(),
            userId: user.id,
            holdId: hold._id,
            legs: hold.legs,
            seats: hold.seats,
            passengers: dto.passengers,
            contactEmail: dto.contactEmail,
            acceptedPoliciesAt: new Date(),
            fareMinor,
            baggageMinor,
            totalMinor,
            currency: hold.legs[0].currency,
            paymentExpiresAt: hold.expiresAt,
            history: [{ at: new Date(), event: 'pending-payment' }],
          },
        ],
        { session },
      );
      return booking;
    });
  }
  async list(user: P2Principal, q: BookingQueryDto) {
    this.access.customer(user);
    const filter = {
      userId: user.id,
      ...(q.group === 'cancelled'
        ? { status: 'cancelled' }
        : q.group === 'past'
          ? {
              status: { $ne: 'cancelled' },
              'legs.arrivalAt': { $not: { $gt: new Date() } },
            }
          : q.group === 'upcoming'
            ? {
                status: { $ne: 'cancelled' },
                'legs.arrivalAt': { $gt: new Date() },
              }
            : {}),
    };
    const [items, total] = await Promise.all([
      this.bookings
        .find(filter)
        .sort({ createdAt: -1, _id: 1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      this.bookings.countDocuments(filter),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }
  async get(id: string, user: P2Principal) {
    this.access.customer(user);
    return this.owned(await this.bookings.findById(objectId(id)).lean(), user);
  }
  async cancel(id: string, user: P2Principal) {
    this.access.customer(user);
    return this.transaction(async (session) => {
      const b: any = this.owned(
        await this.bookings.findById(objectId(id)).session(session).lean(),
        user,
      );
      if (b.status === 'cancelled') return b;
      if (b.status !== 'confirmed')
        throw new ConflictException('Only Confirmed bookings can be cancelled');
      const refundDueMinor = this.refundAmount(b);
      await this.release(b, session);
      await this.emit('booking-cancelled', b, { refundDueMinor }, session);
      return this.bookings.findByIdAndUpdate(
        b._id,
        {
          $set: {
            status: 'cancelled',
            refundDueMinor,
            refundState: refundDueMinor ? 'requested' : 'none',
          },
          $push: { history: { at: new Date(), event: 'user-cancelled' } },
        },
        { new: true, session },
      );
    });
  }
  async expire() {
    const cutoff = new Date();
    await this.flights.flights.updateMany(
      { status: 'scheduled', departureAt: { $lte: cutoff } },
      { $set: { status: 'departed' }, $inc: { revision: 1 } },
    );
    await this.bookings.updateMany(
      { status: 'confirmed', 'legs.arrivalAt': { $not: { $gt: cutoff } } },
      {
        $set: { status: 'completed' },
        $push: { history: { at: cutoff, event: 'completed' } },
      },
    );
    // Bounded batches; subsequent ticks continue the backlog. Never remove inventory documents via TTL.
    const holds = await this.holds
      .find({ state: 'active', expiresAt: { $lte: cutoff } })
      .select('_id')
      .limit(100)
      .lean();
    for (const h of holds)
      await this.transaction(async (session) => {
        const record = await this.holds.findOneAndUpdate(
          { _id: h._id, state: 'active', expiresAt: { $lte: cutoff } },
          { $set: { state: 'released' } },
          { session, new: true },
        );
        if (record) await this.release(record, session);
      });
    const bookings = await this.bookings
      .find({ status: 'pending-payment', paymentExpiresAt: { $lte: cutoff } })
      .select('_id')
      .limit(100)
      .lean();
    for (const b of bookings)
      await this.transaction(async (session) => {
        const record = await this.bookings.findOneAndUpdate(
          {
            _id: b._id,
            status: 'pending-payment',
            paymentExpiresAt: { $lte: cutoff },
          },
          {
            $set: { status: 'expired' },
            $push: { history: { at: cutoff, event: 'payment-expired' } },
          },
          { session, new: true },
        );
        if (record) {
          await this.release(record, session);
          await this.emit(
            'payment-hold-expired',
            record,
            { paymentId: record.paymentId },
            session,
          );
        }
      });
  }
  async applyVerifiedPayment(event: VerifiedFlightPayment) {
    if (
      !event.paymentId?.trim() ||
      !['succeeded', 'failed', 'cancelled'].includes(event.outcome) ||
      !Number.isSafeInteger(event.amountMinor)
    )
      throw new BadRequestException('Invalid verified payment event');
    return this.transaction(async (session) => {
      const b: any = await this.bookings
        .findById(objectId(event.bookingId))
        .session(session)
        .lean();
      if (!b) throw new NotFoundException('Booking not found');
      if (b.totalMinor !== event.amountMinor || b.currency !== event.currency)
        throw new ConflictException(
          'Verified payment amount or currency mismatch',
        );
      if (b.paymentId && b.paymentId !== event.paymentId)
        throw new ConflictException(
          'Different payment already attached; reuse one PaymentIntent per booking',
        );
      if (b.status !== 'pending-payment') {
        if (
          b.paymentId === event.paymentId &&
          ((['confirmed', 'completed'].includes(b.status) &&
            event.outcome === 'succeeded') ||
            (b.status === 'expired' && event.outcome !== 'succeeded'))
        )
          return b;
        // Late capture requires a durable full-refund request; never resurrect released inventory.
        if (
          event.outcome === 'succeeded' &&
          ['expired', 'cancelled'].includes(b.status) &&
          (!b.paymentId || b.paymentId === event.paymentId) &&
          b.refundState === 'none'
        ) {
          return this.bookings.findByIdAndUpdate(
            b._id,
            {
              $set: {
                paymentId: event.paymentId,
                refundDueMinor: b.totalMinor,
                refundState: 'requested',
              },
              $push: {
                history: {
                  at: new Date(),
                  event: 'late-payment-refund-requested',
                },
              },
            },
            { new: true, session },
          );
        }
        if (
          event.outcome === 'succeeded' &&
          b.paymentId === event.paymentId &&
          b.refundState !== 'none'
        )
          return b;
        throw new ConflictException('Payment cannot transition this booking');
      }
      if (event.outcome !== 'succeeded' && b.paymentExpiresAt > new Date()) {
        return this.bookings.findByIdAndUpdate(
          b._id,
          {
            $set: {
              paymentId: event.paymentId,
              lastPaymentOutcome: event.outcome,
            },
            $push: {
              history: {
                at: new Date(),
                event: 'payment-attempt-' + event.outcome,
              },
            },
          },
          { new: true, session },
        );
      }
      const expired = b.paymentExpiresAt <= new Date();
      let bookable = true;
      for (const leg of b.legs) {
        const f = await this.flights.get(String(leg.flightId), session);
        bookable =
          bookable && f.status === 'scheduled' && f.departureAt > new Date();
        await this.flights.flights.updateOne(
          { _id: f._id },
          { $inc: { revision: 1 } },
          { session },
        );
      }
      const success = event.outcome === 'succeeded' && !expired && bookable;
      if (!success) await this.release(b, session);
      if (success)
        await this.emit(
          'booking-confirmed',
          b,
          { reference: b.reference },
          session,
        );
      return this.bookings.findByIdAndUpdate(
        b._id,
        {
          $set: {
            status: success ? 'confirmed' : 'expired',
            paymentId: event.paymentId,
            refundDueMinor:
              !success && event.outcome === 'succeeded' ? b.totalMinor : 0,
            refundState:
              !success && event.outcome === 'succeeded' ? 'requested' : 'none',
          },
          $push: {
            history: {
              at: new Date(),
              event: success ? 'payment-verified' : 'payment-not-confirmed',
            },
          },
        },
        { new: true, session },
      );
    });
  }
  async cancelFlight(id: string, user: P2Principal) {
    return this.transaction(async (session) => {
      const f = await this.flights.get(id, session);
      this.access.manage(user, String(f.airlineId));
      if (f.status === 'cancelled') return f;
      if (f.departureAt <= new Date())
        throw new ConflictException('Departed flight cannot be cancelled');
      await this.flights.flights.updateOne(
        { _id: f._id },
        { $set: { status: 'cancelled' }, $inc: { revision: 1 } },
        { session },
      );
      const holds = await this.holds
        .find({ 'legs.flightId': f._id, state: 'active' })
        .session(session);
      for (const h of holds) {
        await this.release(h, session);
        await this.holds.updateOne(
          { _id: h._id },
          { $set: { state: 'released' } },
          { session },
        );
      }
      const bookings = await this.bookings
        .find({
          'legs.flightId': f._id,
          status: { $in: ['pending-payment', 'confirmed'] },
        })
        .session(session);
      for (const b of bookings) {
        await this.release(b, session);
        await this.emit(
          'flight-cancelled',
          b,
          {
            flightId: id,
            refundDueMinor: b.status === 'confirmed' ? b.totalMinor : 0,
          },
          session,
        );
        await this.bookings.updateOne(
          { _id: b._id },
          {
            $set: {
              status: b.status === 'confirmed' ? 'cancelled' : 'expired',
              refundDueMinor: b.status === 'confirmed' ? b.totalMinor : 0,
              refundState: b.status === 'confirmed' ? 'requested' : 'none',
            },
            $push: {
              history: {
                at: new Date(),
                event: 'airline-cancelled-entire-itinerary',
              },
            },
          },
          { session },
        );
      }
      return this.flights.get(id, session);
    });
  }
  async manifest(id: string, user: P2Principal, q: PageDto) {
    const f = await this.flights.get(id);
    this.access.manage(user, String(f.airlineId));
    const filter = {
      'legs.flightId': f._id,
      status: { $in: ['confirmed', 'cancelled'] },
    };
    const [items, total] = await Promise.all([
      this.bookings
        .find(filter)
        .sort({ _id: 1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      this.bookings.countDocuments(filter),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }
  async exportPassengers(id: string, user: P2Principal) {
    const f = await this.flights.get(id);
    this.access.manage(user, String(f.airlineId));
    const rows: any[] = await this.bookings
      .find({ 'legs.flightId': f._id, status: 'confirmed' })
      .select('reference passengers legs')
      .lean();
    // Quote fields and neutralize spreadsheet formula prefixes, including whitespace/control prefixes.
    const cell = (value: unknown) =>
      '"' +
      String(value ?? '')
        .replace(/^[\s]*([=+@-])/, "'$1")
        .replace(/"/g, '""') +
      '"';
    return [
      'reference,name,type,documentNumber,cabinClass',
      ...rows.flatMap((b) =>
        b.passengers.map((p: any) =>
          [
            b.reference,
            p.name,
            p.type,
            p.documentNumber,
            b.legs.find((l: any) => String(l.flightId) === id).cabinClass,
          ]
            .map(cell)
            .join(','),
        ),
      ),
    ].join('\r\n');
  }
  async ticket(id: string, user: P2Principal) {
    const b = await this.get(id, user);
    if (!['confirmed', 'completed'].includes(b.status) || !b.paymentId)
      throw new ConflictException(
        'E-ticket requires verified successful payment',
      );
    const document = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: { Title: `E-ticket ${b.reference}` },
    });
    const chunks: Buffer[] = [];
    const result = new Promise<Buffer>((resolve, reject) => {
      document.on('data', (c: any) => chunks.push(c));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });
    if (process.env.P2_TICKET_FONT_PATH)
      document.font(process.env.P2_TICKET_FONT_PATH);
    document.fontSize(24).text('Flight e-ticket').moveDown();
    document
      .fontSize(12)
      .text(`Reference: ${b.reference}`)
      .text(`Status: ${b.status}`)
      .moveDown();
    for (const p of b.passengers)
      document.text(
        `${p.name} (${p.type}). Extra bags (kg): ${(p.extraBagWeightsKg || []).join(', ') || 'none'}`,
      );
    document.moveDown();
    for (const leg of b.legs) {
      document
        .fontSize(15)
        .text(
          `${leg.flightNumber}: ${leg.departureAirport} to ${leg.arrivalAirport}`,
        );
      document
        .fontSize(11)
        .text(
          `Departure: ${airportLocalTime(leg.departureAt, leg.departureTimeZone)} (${leg.departureTimeZone})`,
        )
        .text(
          `Arrival: ${airportLocalTime(leg.arrivalAt, leg.arrivalTimeZone)} (${leg.arrivalTimeZone})`,
        )
        .text(
          `Cabin: ${leg.cabinClass}. Free baggage: ${leg.freeBags} bag(s), ${leg.maxWeightKgPerBag} kg per bag.`,
        )
        .moveDown();
    }
    document
      .text(
        `Total paid: ${new Intl.NumberFormat('en', { style: 'currency', currency: b.currency }).format(b.totalMinor / 10 ** new Intl.NumberFormat('en', { style: 'currency', currency: b.currency }).resolvedOptions().maximumFractionDigits!)}`,
      )
      .text('Payment verified by the payment provider.');
    document.end();
    return new StreamableFile(await result, {
      type: 'application/pdf',
      disposition: `attachment; filename="${b.reference}.pdf"`,
    });
  }
  /** P4 polls durable requests and uses booking _id as its Stripe refund idempotency key. */
  pendingRefunds() {
    return this.bookings
      .find({ refundState: 'requested' })
      .select('reference paymentId refundDueMinor currency userId')
      .limit(100)
      .lean();
  }
  async paymentContext(id: string, user: P2Principal) {
    const b = await this.get(id, user);
    if (
      b.status !== 'pending-payment' ||
      b.paymentExpiresAt <= new Date() ||
      !b.acceptedPoliciesAt
    )
      throw new ConflictException('Booking is not eligible for payment');
    return {
      bookingId: String(b._id),
      amountMinor: b.totalMinor,
      currency: b.currency,
      expiresAt: b.paymentExpiresAt,
      acceptedPoliciesAt: b.acceptedPoliciesAt,
    };
  }
  async acknowledgeVerifiedRefund(
    bookingId: string,
    paymentId: string,
    amountMinor: number,
    outcome: 'completed' | 'failed' = 'completed',
  ) {
    if (
      !['completed', 'failed'].includes(outcome) ||
      !Number.isSafeInteger(amountMinor) ||
      amountMinor <= 0
    )
      throw new BadRequestException('Invalid verified refund outcome');
    return this.transaction(async (session) => {
      const b: any = await this.bookings
        .findById(objectId(bookingId))
        .session(session)
        .lean();
      if (
        !b ||
        b.paymentId !== paymentId ||
        b.refundDueMinor !== amountMinor ||
        b.refundState === 'none'
      )
        throw new ConflictException('Refund does not match request');
      if (b.refundState === 'completed' || b.refundState === outcome) return b;
      await this.emit(
        'refund-' + outcome,
        b,
        { amountMinor, paymentId },
        session,
      );
      return this.bookings.findByIdAndUpdate(
        b._id,
        {
          $set: { refundState: outcome },
          $push: { history: { at: new Date(), event: 'refund-' + outcome } },
        },
        { new: true, session },
      );
    });
  }
}
