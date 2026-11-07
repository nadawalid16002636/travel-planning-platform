import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import * as request from 'supertest';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { AirlinesModule } from '../airlines/airlines.module';
import { P2Module } from './p2.module';
import { P2Access } from './access';
import { P2Rules } from './rules';
import { AirportsService } from './airports.service';
import { BookingsService } from './bookings.service';

// Synthetic fixtures only. This suite never loads AppModule, ConfigModule or .env.
const rules = {
  source: 'synthetic integration fixture',
  adultMinAge: 12,
  childMinAge: 2,
  maxPassengers: 9,
  maxInfantsPerAdult: 1,
  infantOccupiesSeat: false,
  childFarePercent: 100,
  infantFarePercent: 10,
};
const passenger = {
  name: 'Test Passenger',
  type: 'adult',
  dateOfBirth: '2000-01-01',
  documentNumber: 'TEST-1',
  extraBagWeightsKg: [10],
};

describe('P2 isolated MongoDB replica-set integration', () => {
  let db: MongoMemoryReplSet;
  let app: INestApplication;
  let connection: Connection;
  let service: BookingsService;
  let airlineId: string;
  let flightId: string;
  let returnId: string;
  let nextFlight = 100;
  let departure: string;
  let arrival: string;
  const api = () => request(app.getHttpServer());
  const admin = { 'x-test-actor': 'admin' };
  const customer = { 'x-test-actor': 'user' };
  const mod = { 'x-test-actor': 'moderator' };
  const bookingPayload = (holdId: string) => ({
    holdId,
    passengers: [passenger],
    acceptedPolicies: true,
    contactEmail: 'test@example.com',
  });
  const hold = async (id = flightId, headers = customer, legs?: any[]) => {
    const res = await api()
      .post('/api/flight-bookings/hold')
      .set(headers)
      .send({
        seats: 1,
        legs: legs || [{ flightId: id, cabinClass: 'economy' }],
      })
      .expect(201);
    return res.body;
  };
  const book = async (id = flightId) => {
    const h = await hold(id);
    return (
      await api()
        .post('/api/flight-bookings')
        .set(customer)
        .send(bookingPayload(h._id))
        .expect(201)
    ).body;
  };
  const createFlight = async (capacity = 3, reverse = false) => {
    const start = Date.now() + (reverse ? 14 : 7) * 86400000;
    const payload = {
      flightNumber: `MS${nextFlight++}`,
      airlineId,
      departureAirport: reverse ? 'LHR' : 'CAI',
      arrivalAirport: reverse ? 'CAI' : 'LHR',
      departureAt: new Date(start).toISOString(),
      arrivalAt: new Date(start + 7200000).toISOString(),
      cabins: [
        {
          cabinClass: 'economy',
          capacity,
          priceMinor: 10000,
          currency: 'USD',
          freeBags: 1,
          maxWeightKgPerBag: 23,
        },
      ],
    };
    const res = await api()
      .post('/api/flights')
      .set(mod)
      .send(payload)
      .expect(201);
    if (!reverse) {
      departure = payload.departureAt;
      arrival = payload.arrivalAt;
    }
    return res.body;
  };
  beforeAll(async () => {
    mkdirSync(resolve(__dirname, '../../.tmp'), { recursive: true });
    db = await MongoMemoryReplSet.create({
      replSet: { count: 1, ip: '127.0.0.1' },
      binary: {
        downloadDir: resolve(
          __dirname,
          '../../node_modules/.cache/mongodb-binaries',
        ),
      },
    });
    const module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(db.getUri('p2_isolated_test')),
        AirlinesModule,
        P2Module,
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    connection = app.get(getConnectionToken());
    service = app.get(BookingsService);
    app.get(P2Rules).configure(rules);
    // Deliberately test-only adapter: never imported or enabled by the application.
    app.get(P2Access).register({
      authenticate: async (context) => {
        const actor = context.switchToHttp().getRequest().headers[
          'x-test-actor'
        ];
        if (actor === 'admin')
          return { id: 'admin', roles: ['admin'], airlineIds: [] };
        if (actor === 'moderator')
          return {
            id: 'moderator',
            roles: ['airline-moderator'],
            airlineIds: [airlineId],
          };
        if (actor === 'user' || actor === 'other')
          return { id: actor, roles: ['user'], airlineIds: [] };
        return null;
      },
    });
    await app.init();
    service.onModuleDestroy(); // deterministic expiry tests; no timer races
    await Promise.all(Object.values(connection.models).map((m) => m.init()));
    await app.get(AirportsService).importReference([
      {
        officialId: 'test-cai',
        code: 'CAI',
        name: 'Synthetic Cairo',
        city: 'Cairo',
        country: 'EG',
        timeZone: 'Africa/Cairo',
      },
      {
        officialId: 'test-lhr',
        code: 'LHR',
        name: 'Synthetic London',
        city: 'London',
        country: 'GB',
        timeZone: 'Europe/London',
      },
    ]);
  }, 180000);
  afterAll(async () => {
    if (app) await app.close();
    if (db) await db.stop();
  });
  beforeEach(async () => {
    // These deletes are only against the ephemeral replica set created above.
    for (const name of ['FlightBooking', 'SeatHold', 'Flight', 'Airline'])
      await connection.model(name).deleteMany({});
    const a = await api()
      .post('/api/airlines')
      .set(admin)
      .send({ name: 'Synthetic Airline', code: 'MS', country: 'EG' })
      .expect(201);
    airlineId = a.body._id;
    await api()
      .put(`/api/airlines/${airlineId}/baggage-policy`)
      .set(mod)
      .send({
        checkedBaggageKg: 23,
        cabinBaggageKg: 7,
        extraBagPriceMinor: 100,
        maxExtraBagsPerPassenger: 2,
        currency: 'USD',
      })
      .expect(200);
    await api()
      .put(`/api/airlines/${airlineId}/cancellation-policy`)
      .set(mod)
      .send({
        tiers: [
          { daysBeforeDeparture: 0, refundPercent: 80 },
          { daysBeforeDeparture: 1, refundPercent: 100 },
        ],
      })
      .expect(200);
    flightId = (await createFlight())._id;
    returnId = (await createFlight(3, true))._id;
  });
  it('creates and updates airlines, detects duplicates and validates policies', async () => {
    await api()
      .post('/api/airlines')
      .set(admin)
      .send({ name: 'Other name', code: 'ms', country: 'EG' })
      .expect(409);
    await api()
      .patch(`/api/airlines/${airlineId}`)
      .set(mod)
      .send({ description: 'Updated', logo: 'https://example.com/airline.png' })
      .expect(200);
    const a = await api().get(`/api/airlines/${airlineId}`).expect(200);
    expect(a.body.description).toBe('Updated');
    expect(a.body.logo).toBe('https://example.com/airline.png');
    expect(a.body.baggagePolicy.checkedBaggageKg).toBe(23);
    await api()
      .put(`/api/airlines/${airlineId}/cancellation-policy`)
      .set(mod)
      .send({ tiers: [{ daysBeforeDeparture: -1, refundPercent: 101 }] })
      .expect(400);
    await api().get('/api/airlines/bad').expect(400);
  });
  it('imports airports idempotently and preserves official identifiers', async () => {
    await app.get(AirportsService).importReference([
      {
        officialId: 'test-cai',
        code: 'CAI',
        name: 'Changed',
        city: 'Cairo',
        country: 'EG',
        timeZone: 'Africa/Cairo',
      },
    ]);
    const a = await api().get('/api/airports?code=CAI').expect(200);
    expect(a.body.total).toBe(1);
    expect(a.body.items[0].officialId).toBe('test-cai');
    expect(a.body.items[0].name).toBe('Synthetic Cairo');
    await api().get('/api/airports?code=BADCODE').expect(400);
    await expect(
      app.get(AirportsService).importReference([
        {
          officialId: 'new',
          code: 'ZZZ',
          name: 'Test',
          city: 'Test',
          country: 'Test',
          timeZone: 'Invalid/Zone',
        },
      ]),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('searches one-way and round-trip inventory with filtering and pagination', async () => {
    const flight: any = await connection
      .model('Flight')
      .findById(flightId)
      .lean();
    const local = (date: Date, timeZone: string) => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(date);
      return ['year', 'month', 'day']
        .map((k) => parts.find((p) => p.type === k).value)
        .join('-');
    };
    const inbound: any = await connection
      .model('Flight')
      .findById(returnId)
      .lean();
    const q = {
      departureAirport: 'CAI',
      arrivalAirport: 'LHR',
      departureDate: local(flight.departureAt, 'Africa/Cairo'),
      returnDate: local(inbound.departureAt, 'Europe/London'),
      tripType: 'round-trip',
      currency: 'USD',
      sort: 'price-asc',
      limit: 1,
    };
    const res = await api().get('/api/flights/search').query(q).expect(200);
    expect(res.body.outbound.total).toBe(1);
    expect(res.body.inbound.total).toBe(1);
    expect(res.body.outbound.items[0].availableSeats).toBe(3);
    const empty = await api()
      .get('/api/flights/search')
      .query({ ...q, minPriceMinor: 20000 })
      .expect(200);
    expect(empty.body.outbound.items).toEqual([]);
    await api()
      .get('/api/flights/search')
      .query({ ...q, returnDate: undefined })
      .expect(400);
    const one = await api()
      .get('/api/flights/search')
      .query({ ...q, tripType: 'one-way', returnDate: undefined })
      .expect(200);
    expect(one.body.inbound).toBeUndefined();
  });
  it('rejects duplicate flights and protects schedule and cabin inventory', async () => {
    const f = (await api().get(`/api/flights/${flightId}`).expect(200)).body;
    const payload = {
      flightNumber: f.flightNumber,
      airlineId,
      departureAirport: 'CAI',
      arrivalAirport: 'LHR',
      departureAt: f.departureAt,
      arrivalAt: f.arrivalAt,
      cabins: [
        {
          cabinClass: 'economy',
          capacity: 3,
          priceMinor: 10000,
          currency: 'USD',
          freeBags: 1,
          maxWeightKgPerBag: 23,
        },
      ],
    };
    await api().post('/api/flights').set(mod).send(payload).expect(409);
    await api()
      .post('/api/flights')
      .set(mod)
      .send({
        ...payload,
        departureAt: `${f.departureLocalDate}T12:00:00`,
        arrivalAt: `${f.departureLocalDate}T18:00:00`,
      })
      .expect(409);
    await api()
      .patch(`/api/flights/${flightId}`)
      .set(mod)
      .send({
        arrivalAt: new Date(new Date(arrival).getTime() + 60000).toISOString(),
      })
      .expect(200);
    await api()
      .post(`/api/flights/${flightId}/cabins`)
      .set(mod)
      .send({
        cabinClass: 'business',
        capacity: 2,
        priceMinor: 20000,
        currency: 'USD',
        freeBags: 2,
        maxWeightKgPerBag: 30,
      })
      .expect(201);
    await hold();
    await api()
      .patch(`/api/flights/${flightId}/cabins/${f.cabins[0]._id}`)
      .set(mod)
      .send({ capacity: 0 })
      .expect(400);
    await api()
      .patch(`/api/flights/${flightId}`)
      .set(mod)
      .send({
        departureAt: new Date(
          new Date(departure).getTime() + 60000,
        ).toISOString(),
      })
      .expect(200);
  });
  it('enforces authentication, moderator assignment and booking ownership', async () => {
    await api().post('/api/flights').send({}).expect(401);
    await api().post('/api/flights').set(customer).send({}).expect(400); // DTO rejects input before service authorization
    await api()
      .post(`/api/flights/${flightId}/cancel`)
      .set(customer)
      .send({ confirmed: true })
      .expect(403);
    await api().get('/api/flight-bookings').expect(401);
    const b = await book();
    await api()
      .get(`/api/flight-bookings/${b._id}`)
      .set({ 'x-test-actor': 'other' })
      .expect(403);
    await api()
      .post(`/api/flight-bookings/${b._id}/cancel`)
      .set({ 'x-test-actor': 'other' })
      .send({ confirmed: true })
      .expect(403);
    const history = await api()
      .get('/api/flight-bookings')
      .set(customer)
      .expect(200);
    expect(history.body.total).toBe(1);
    await api().get(`/api/flights/${flightId}/bookings`).set(mod).expect(200);
    await api()
      .get(`/api/flights/${flightId}/passengers/export`)
      .set(customer)
      .expect(403);
  });
  it('prevents concurrent overbooking using real MongoDB transactions', async () => {
    const f = await createFlight(1);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        api()
          .post('/api/flight-bookings/hold')
          .set(customer)
          .send({
            seats: 1,
            legs: [{ flightId: f._id, cabinClass: 'economy' }],
          }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(7);
    const stored: any = await connection.model('Flight').findById(f._id).lean();
    expect(stored.cabins[0].reserved).toBe(1);
  });
  it('rolls back the first leg if a round-trip second leg has no inventory', async () => {
    const full = await createFlight(1, true);
    await hold(full._id);
    await api()
      .post('/api/flight-bookings/hold')
      .set(customer)
      .send({
        seats: 1,
        legs: [
          { flightId, cabinClass: 'economy' },
          { flightId: full._id, cabinClass: 'economy' },
        ],
      })
      .expect(409);
    const f: any = await connection.model('Flight').findById(flightId).lean();
    expect(f.cabins[0].reserved).toBe(0);
  });
  it('expires holds and pending bookings, releasing inventory exactly once', async () => {
    const h = await hold();
    await connection
      .model('SeatHold')
      .updateOne({ _id: h._id }, { $set: { expiresAt: new Date(0) } });
    await service.expire();
    await service.expire();
    await api()
      .post('/api/flight-bookings')
      .set(customer)
      .send(bookingPayload(h._id))
      .expect(409);
    const b = await book();
    await connection
      .model('FlightBooking')
      .updateOne({ _id: b._id }, { $set: { paymentExpiresAt: new Date(0) } });
    await Promise.all([service.expire(), service.expire()]);
    const f: any = await connection.model('Flight').findById(flightId).lean();
    expect(f.cabins[0].reserved).toBe(0);
    expect(
      (await connection.model('FlightBooking').findById(b._id)).status,
    ).toBe('expired');
  });
  it('creates priced round-trip bookings and consumes a hold only once', async () => {
    const h = await hold(flightId, customer, [
      { flightId, cabinClass: 'economy' },
      { flightId: returnId, cabinClass: 'economy' },
    ]);
    const b = (
      await api()
        .post('/api/flight-bookings')
        .set(customer)
        .send(bookingPayload(h._id))
        .expect(201)
    ).body;
    expect(b.totalMinor).toBe(20200);
    expect(b.status).toBe('pending-payment');
    expect(b.legs).toHaveLength(2);
    await api()
      .post('/api/flight-bookings')
      .set(customer)
      .send(bookingPayload(h._id))
      .expect(409);
    await api()
      .get(`/api/flight-bookings/${b._id}/e-ticket`)
      .set(customer)
      .expect(409);
    await api()
      .post('/api/flight-bookings')
      .set(customer)
      .send({ ...bookingPayload(h._id), paymentSucceeded: true })
      .expect(400);
  });
  it('verifies payment amount, confirms idempotently, and issues an e-ticket and CSV manifest', async () => {
    const b = await book();
    const event = {
      bookingId: b._id,
      paymentId: 'payment-1',
      outcome: 'succeeded' as const,
      amountMinor: b.totalMinor,
      currency: 'USD',
    };
    await expect(
      service.applyVerifiedPayment({ ...event, amountMinor: 1 }),
    ).rejects.toMatchObject({ status: 409 });
    await Promise.all([
      service.applyVerifiedPayment(event),
      service.applyVerifiedPayment(event),
    ]);
    const ticket = await api()
      .get(`/api/flight-bookings/${b._id}/e-ticket`)
      .set(customer)
      .expect(200);
    writeFileSync(
      resolve(__dirname, '../../.tmp/test-ticket.pdf'),
      ticket.body,
    );
    expect(ticket.headers['content-type']).toContain('application/pdf');
    expect(ticket.body.subarray(0, 5).toString()).toBe('%PDF-');
    const csv = await api()
      .get(`/api/flights/${flightId}/passengers/export`)
      .set(mod)
      .expect(200);
    expect(csv.text).toContain('Test Passenger');
  });
  it('releases failed payments and coordinates policy refunds after cancellation', async () => {
    const failed = await book();
    await service.applyVerifiedPayment({
      bookingId: failed._id,
      paymentId: 'fail',
      outcome: 'failed',
      amountMinor: failed.totalMinor,
      currency: 'USD',
    });
    expect(
      (await connection.model('FlightBooking').findById(failed._id)).status,
    ).toBe('pending-payment');
    await connection
      .model('FlightBooking')
      .updateOne(
        { _id: failed._id },
        { $set: { paymentExpiresAt: new Date(0) } },
      );
    await service.expire();
    const b = await book();
    await service.applyVerifiedPayment({
      bookingId: b._id,
      paymentId: 'success',
      outcome: 'succeeded',
      amountMinor: b.totalMinor,
      currency: 'USD',
    });
    const cancelled = await api()
      .post(`/api/flight-bookings/${b._id}/cancel`)
      .set(customer)
      .send({ confirmed: true })
      .expect(201);
    expect(cancelled.body.refundDueMinor).toBe(b.totalMinor);
    expect(cancelled.body.refundState).toBe('requested');
    await service.acknowledgeVerifiedRefund(b._id, 'success', b.totalMinor);
    await api()
      .post(`/api/flight-bookings/${b._id}/cancel`)
      .set(customer)
      .send({ confirmed: true })
      .expect(201);
    const f: any = await connection.model('Flight').findById(flightId).lean();
    expect(f.cabins[0].reserved).toBe(0);
  });
  it('cancels entire round-trip itineraries and handles a late captured payment as a refund', async () => {
    const h = await hold(flightId, customer, [
      { flightId, cabinClass: 'economy' },
      { flightId: returnId, cabinClass: 'economy' },
    ]);
    const b = (
      await api()
        .post('/api/flight-bookings')
        .set(customer)
        .send(bookingPayload(h._id))
        .expect(201)
    ).body;
    await api()
      .post(`/api/flights/${flightId}/cancel`)
      .set(mod)
      .send({ confirmed: true })
      .expect(201);
    const late = await service.applyVerifiedPayment({
      bookingId: b._id,
      paymentId: 'late',
      outcome: 'succeeded',
      amountMinor: b.totalMinor,
      currency: 'USD',
    });
    expect(late.status).toBe('expired');
    expect(late.refundDueMinor).toBe(b.totalMinor);
    for (const id of [flightId, returnId]) {
      const f: any = await connection.model('Flight').findById(id).lean();
      expect(f.cabins[0].reserved).toBe(0);
    }
  });

  it('uses official age boundaries, full child fares, infant fares and per-passenger bag limits', async () => {
    const h = await api()
      .post('/api/flight-bookings/hold')
      .set(customer)
      .send({ seats: 2, legs: [{ flightId, cabinClass: 'economy' }] })
      .expect(201);
    const travelYear = new Date(departure).getUTCFullYear();
    const passengers = [
      { ...passenger, dateOfBirth: `${travelYear - 13}-01-01` },
      {
        name: 'Child',
        type: 'child',
        dateOfBirth: `${travelYear - 5}-01-01`,
        documentNumber: 'CHILD',
        extraBagWeightsKg: [],
      },
      {
        name: 'Infant',
        type: 'infant',
        dateOfBirth: `${travelYear}-01-01`,
        documentNumber: 'INFANT',
        extraBagWeightsKg: [],
      },
    ];
    const bad = {
      ...bookingPayload(h.body._id),
      passengers: [
        { ...passengers[0], extraBagWeightsKg: [24] },
        ...passengers.slice(1),
      ],
    };
    await api()
      .post('/api/flight-bookings')
      .set(customer)
      .send(bad)
      .expect(400);
    await api()
      .post('/api/flight-bookings')
      .set(customer)
      .send({
        ...bad,
        passengers: [
          { ...passengers[0], extraBagWeightsKg: [10, 10, 10] },
          ...passengers.slice(1),
        ],
      })
      .expect(400);
    const b = await api()
      .post('/api/flight-bookings')
      .set(customer)
      .send({ ...bookingPayload(h.body._id), passengers })
      .expect(201);
    expect(b.body.fareMinor).toBe(21000);
    expect(b.body.baggageMinor).toBe(100);
    expect(b.body.seats).toBe(2);
  });
  it('uses the outbound cancellation tier for the whole round trip and requires confirmation', async () => {
    await connection.model('Airline').updateOne(
      { _id: airlineId },
      {
        $set: {
          'cancellationPolicy.tiers': [
            { daysBeforeDeparture: 0, refundPercent: 50 },
            { daysBeforeDeparture: 30, refundPercent: 100 },
          ],
        },
      },
    );
    const h = await hold(flightId, customer, [
      { flightId, cabinClass: 'economy' },
      { flightId: returnId, cabinClass: 'economy' },
    ]);
    const b = (
      await api()
        .post('/api/flight-bookings')
        .set(customer)
        .send(bookingPayload(h._id))
        .expect(201)
    ).body;
    await service.applyVerifiedPayment({
      bookingId: b._id,
      paymentId: 'tier-payment',
      outcome: 'succeeded',
      amountMinor: b.totalMinor,
      currency: 'USD',
    });
    const quote = await api()
      .get(`/api/flight-bookings/${b._id}/cancellation-quote`)
      .set(customer)
      .expect(200);
    expect(quote.body.refundDueMinor).toBe(10100);
    await api()
      .post(`/api/flight-bookings/${b._id}/cancel`)
      .set(customer)
      .send({ confirmed: false })
      .expect(400);
    const result = await api()
      .post(`/api/flight-bookings/${b._id}/cancel`)
      .set(customer)
      .send({ confirmed: true })
      .expect(201);
    expect(result.body.refundDueMinor).toBe(10100);
  });
  it('keeps failed payments retryable until the original ten-minute deadline', async () => {
    const b = await book();
    expect(
      new Date(b.paymentExpiresAt).getTime() - new Date(b.createdAt).getTime(),
    ).toBeLessThanOrEqual(600000);
    await service.applyVerifiedPayment({
      bookingId: b._id,
      paymentId: 'retry',
      outcome: 'failed',
      amountMinor: b.totalMinor,
      currency: 'USD',
    });
    const retried = await service.applyVerifiedPayment({
      bookingId: b._id,
      paymentId: 'retry',
      outcome: 'succeeded',
      amountMinor: b.totalMinor,
      currency: 'USD',
    });
    expect(retried.status).toBe('confirmed');
    const f: any = await connection.model('Flight').findById(flightId).lean();
    expect(f.cabins[0].reserved).toBe(1);
  });
  it('updates booked schedules, preserves agreed fares and queues durable notifications', async () => {
    const b = await book();
    await service.applyVerifiedPayment({
      bookingId: b._id,
      paymentId: 'schedule-payment',
      outcome: 'succeeded',
      amountMinor: b.totalMinor,
      currency: 'USD',
    });
    const newArrival = new Date(
      new Date(arrival).getTime() + 60000,
    ).toISOString();
    await api()
      .patch(`/api/flights/${flightId}`)
      .set(mod)
      .send({ arrivalAt: newArrival })
      .expect(200);
    const updated = await api()
      .get(`/api/flight-bookings/${b._id}`)
      .set(customer)
      .expect(200);
    expect(updated.body.legs[0].arrivalAt).toBe(newArrival);
    expect(updated.body.totalMinor).toBe(b.totalMinor);
    const events: any[] = await service.pendingEvents();
    expect(
      events.some(
        (e) =>
          e.kind === 'flight-schedule-changed' && String(e.bookingId) === b._id,
      ),
    ).toBe(true);
    await service.acknowledgeEvent(String(events[0]._id));
    await api()
      .patch(`/api/flights/${flightId}`)
      .set(mod)
      .send({ departureAirport: 'JFK' })
      .expect(409);
  });
  it('marks departed flights and completed bookings, grouping booking history', async () => {
    const b = await book();
    await service.applyVerifiedPayment({
      bookingId: b._id,
      paymentId: 'completed-payment',
      outcome: 'succeeded',
      amountMinor: b.totalMinor,
      currency: 'USD',
    });
    await connection.model('Flight').updateOne(
      { _id: flightId },
      {
        $set: {
          departureAt: new Date(Date.now() - 7200000),
          arrivalAt: new Date(Date.now() - 3600000),
        },
      },
    );
    await connection.model('FlightBooking').updateOne(
      { _id: b._id },
      {
        $set: {
          'legs.0.departureAt': new Date(Date.now() - 7200000),
          'legs.0.arrivalAt': new Date(Date.now() - 3600000),
        },
      },
    );
    await service.expire();
    expect((await connection.model('Flight').findById(flightId)).status).toBe(
      'departed',
    );
    expect(
      (await connection.model('FlightBooking').findById(b._id)).status,
    ).toBe('completed');
    const past = await api()
      .get('/api/flight-bookings?group=past')
      .set(customer)
      .expect(200);
    expect(past.body.total).toBe(1);
    await api()
      .post(`/api/flight-bookings/${b._id}/cancel`)
      .set(customer)
      .send({ confirmed: true })
      .expect(409);
  });
  it('loads all eight supplied official airport records without changing identifiers', async () => {
    const rows = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../data/official-airports.json'),
        'utf8',
      ),
    );
    // Separate ephemeral collection prevents colliding with synthetic CAI/LHR fixtures.
    const schema = connection.model('Airport').schema.clone();
    const isolated = connection.model('OfficialAirportFixture', schema);
    const importer = new AirportsService(isolated);
    await importer.importReference(rows);
    await importer.importReference(rows);
    expect(await isolated.countDocuments()).toBe(8);
    const jfk: any = await isolated.findOne({ code: 'JFK' }).lean();
    expect(jfk.officialId).toBe('JFK');
    expect(jfk.cityId).toBe('new_york');
  });
  it('enforces booked/held cabin capacity floors while preserving existing quoted prices', async () => {
    const f = await createFlight(2);
    const h = await api()
      .post('/api/flight-bookings/hold')
      .set(customer)
      .send({ seats: 2, legs: [{ flightId: f._id, cabinClass: 'economy' }] })
      .expect(201);
    await api()
      .patch(`/api/flights/${f._id}/cabins/${f.cabins[0]._id}`)
      .set(mod)
      .send({ capacity: 1 })
      .expect(409);
    await api()
      .patch(`/api/flights/${f._id}/cabins/${f.cabins[0]._id}`)
      .set(mod)
      .send({ priceMinor: 20000 })
      .expect(200);
    const stored: any = await connection
      .model('SeatHold')
      .findById(h.body._id)
      .lean();
    expect(stored.legs[0].priceMinor).toBe(10000);
    await api().get('/api/airlines').set(admin).expect(200);
    await api().get('/api/airlines').set(mod).expect(403);
    await api()
      .patch(`/api/airlines/${airlineId}`)
      .set(mod)
      .send({ code: null })
      .expect(400);
  });
  it('generates Swagger paths for every P2 endpoint without duplicate prefixes', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addCookieAuth('session').build(),
    );
    expect(Object.keys(doc.paths)).toHaveLength(19);
    expect(doc.components.securitySchemes.cookie).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: 'session',
    });
    writeFileSync(
      resolve(__dirname, '../../.tmp/p2-openapi.json'),
      JSON.stringify(doc, null, 2),
    );
    expect(
      doc.paths['/api/flight-bookings/{id}/e-ticket'].get.security,
    ).toBeDefined();
    expect(
      doc.paths['/api/flights/search'].get.parameters.length,
    ).toBeGreaterThan(5);
  });
});
