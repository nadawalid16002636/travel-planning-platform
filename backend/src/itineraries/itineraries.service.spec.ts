
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import mongoose from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { ItinerariesService } from './itineraries.service.js';
import { Itinerary } from './itinerary.schema.js';
import { ItinerarySchema } from './itinerary.schema.js';
import { ReferenceService } from '../reference/reference.service.js';
import { CreateItineraryDto } from './dto/create-itinerary.dto.js';
import { UpdateItineraryDto } from './dto/update-itinerary.dto.js';
import { ConfirmItineraryDeletionDto } from './dto/confirm-itinerary-deletion.dto.js';
import { ItinerariesPaginationQueryDto } from './dto/itineraries-pagination-query.dto.js';
import { CreateItineraryDayDto } from './dto/create-itinerary-day.dto.js';
import { UpdateItineraryDayDto } from './dto/update-itinerary-day.dto.js';
import { ConfirmDayDeletionDto } from './dto/confirm-day-deletion.dto.js';
import { MoveItineraryDayDto } from './dto/move-itinerary-day.dto.js';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDayBudgetEntryDto } from './dto/create-day-budget-entry.dto.js';
import { UpdateDayBudgetEntryDto } from './dto/update-day-budget-entry.dto.js';
import { CreateIntercityTransportEntryDto } from './dto/create-intercity-transport-entry.dto.js';
import { UpdateIntercityTransportEntryDto } from './dto/update-intercity-transport-entry.dto.js';
import { CreateItineraryActivityDto } from './dto/create-itinerary-activity.dto.js';
import { UpdateItineraryActivityDto } from './dto/update-itinerary-activity.dto.js';
import { UsersService } from '../users/users.service.js';
import { FxCacheDatabaseError, FxService } from '../fx/fx.service.js';
import { PublicItinerarySearchDto } from './dto/public-itinerary.dto.js';
import { HotelsService } from '../hotels/hotels.service.js';
import { AirportsService } from '../p2/airports.service.js';
import { FlightsService } from '../p2/flights.service.js';
import { BookingsService } from '../p2/bookings.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import { ItineraryFlightSearchDto, ItineraryHotelSearchDto } from './dto/itinerary-search-integrations.dto.js';

describe('ItinerariesService', () => {
  let service: ItinerariesService;
  const reference = {
    country: vi.fn().mockResolvedValue({ _id: 'EG' }),
    city: vi.fn().mockResolvedValue({ _id: 'cairo' }),
    isSupportedCurrency: vi.fn().mockResolvedValue(true),
    countries: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    cities: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  };
  const usersService = { findById: vi.fn() };
  const fxService = {
    getLatestCachedSnapshot: vi.fn(),
    refreshSnapshotOrFallback: vi.fn(),
  };
  const hotelsService = { search: vi.fn() };
  const airportsService = { find: vi.fn(), byCode: vi.fn() };
  const flightsService = { search: vi.fn() };
  const flightBookings = { get: vi.fn(), cancel: vi.fn() };
  const uploadsService = { validateAndStore: vi.fn(), get: vi.fn(), remove: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    reference.country.mockResolvedValue({ _id: 'EG', name: 'Egypt' });
    reference.city.mockResolvedValue({ _id: 'cairo', name: 'Cairo', countryCode: 'EG' });
    reference.isSupportedCurrency.mockResolvedValue(true);
    reference.countries.mockResolvedValue({ data: [], total: 0 });
    reference.cities.mockResolvedValue({ data: [], total: 0 });
    usersService.findById.mockResolvedValue({ preferences: { currency: 'USD' } });
    fxService.getLatestCachedSnapshot.mockResolvedValue(null);
    hotelsService.search.mockResolvedValue({ data: [], total: 0, page: 1, limit: 10 });
    airportsService.find.mockResolvedValue({ data: [], items: [], total: 0, page: 1, limit: 100 });
    airportsService.byCode.mockResolvedValue({ code: 'CAI', name: 'Cairo International', city: 'Cairo', cityId: 'cairo', country: 'Egypt' });
    flightsService.search.mockResolvedValue({ outbound: { items: [], total: 0, page: 1, limit: 20 } });
    flightBookings.get.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItinerariesService,
        {
          provide: getModelToken(Itinerary.name),
          useValue: {},
        },
        { provide: ReferenceService, useValue: reference },
        { provide: UsersService, useValue: usersService },
        { provide: FxService, useValue: fxService },
        { provide: HotelsService, useValue: hotelsService },
        { provide: AirportsService, useValue: airportsService },
        { provide: FlightsService, useValue: flightsService },
        { provide: BookingsService, useValue: flightBookings },
        { provide: UploadsService, useValue: uploadsService },
      ],
    }).compile();

    service = module.get<ItinerariesService>(ItinerariesService);
  });

  const makeItinerary = (days: any[] = [], extra: Record<string, any> = {}) => ({
    _id: '64b000000000000000000002',
    userId: '64b000000000000000000001',
    startDate: new Date('2026-01-30T17:45:00.000Z'),
    days,
    budgetEntries: [{ category: 'food', amount: 25, currency: 'EGP' }],
    save: vi.fn(async function (this: any) { return this; }),
    ...extra,
  });

  const mockOwnedItinerary = (itinerary: any) =>
    vi.spyOn(service as any, 'getOwnedItinerary').mockResolvedValue(itinerary);

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('lists only public itinerary summaries for an author', async () => {
    const authorId = new mongoose.Types.ObjectId();
    const itineraryId = new mongoose.Types.ObjectId();
    const model = (service as any).itineraryModel;
    const select = vi.fn();
    const sort = vi.fn();
    const skip = vi.fn();
    const limit = vi.fn();
    const lean = vi.fn();
    const execFind = vi.fn().mockResolvedValue([{
      _id: itineraryId,
      title: 'Public trip',
      countryCodes: ['EG'],
      startDate: new Date('2026-05-01T00:00:00.000Z'),
      days: [{ order: 1, cityId: 'cairo' }, { order: 2, cityId: 'cairo' }],
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }]);
    const query: any = { select, sort, skip, limit, lean, exec: execFind };
    select.mockReturnValue(query);
    sort.mockReturnValue(query);
    skip.mockReturnValue(query);
    limit.mockReturnValue(query);
    lean.mockReturnValue(query);
    model.find = vi.fn().mockReturnValue(query);
    model.countDocuments = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(1) });

    await expect(service.findPublicByAuthor(String(authorId), 1, 10)).resolves.toMatchObject({
      data: [{
        id: String(itineraryId),
        title: 'Public trip',
        countryCodes: ['EG'],
        durationDays: 2,
        cityIds: ['cairo'],
      }],
      page: 1,
      limit: 10,
      total: 1,
    });
    expect(model.find).toHaveBeenCalledWith({ userId: authorId, visibility: 'public' });
    expect(model.countDocuments).toHaveBeenCalledWith({ userId: authorId, visibility: 'public' });
    expect(select).toHaveBeenCalledWith('_id title countryCodes startDate days.order days.cityId updatedAt');
    expect(sort).toHaveBeenCalledWith({ updatedAt: -1, _id: -1 });
  });

  it('resolves an attached itinerary only while it remains public and returns a safe summary', async () => {
    const id = new mongoose.Types.ObjectId();
    const model = (service as any).itineraryModel;
    const q: any = {};
    q.select = vi.fn(() => q);
    q.lean = vi.fn(() => q);
    q.exec = vi.fn().mockResolvedValue({
      _id: id,
      title: 'Shared trip',
      countryCodes: ['EG'],
      startDate: new Date('2026-08-01T00:00:00Z'),
      days: [{ order: 1, cityId: 'cairo' }, { order: 2, cityId: 'giza' }],
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      userId: new mongoose.Types.ObjectId(),
      budgetEntries: [{ amount: 100000 }],
    });
    model.findOne = vi.fn().mockReturnValue(q);
    await expect(service.findPublicSummaryById(String(id))).resolves.toMatchObject({
      id: String(id), title: 'Shared trip', durationDays: 2, cityIds: ['cairo', 'giza'],
    });
    expect(model.findOne).toHaveBeenCalledWith({ _id: id, visibility: 'public' });
    expect(q.select).toHaveBeenCalledWith('_id title countryCodes startDate days.order days.cityId updatedAt');
    model.findOne.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) }) }) });
    await expect(service.findPublicSummaryById(String(id))).resolves.toBeNull();
  });

  it('associates only an owned confirmed flight with its matching day and feeds the budget once', async () => {
    const bookingId = new mongoose.Types.ObjectId();
    const itinerary = makeItinerary([{
      order: 1,
      date: new Date('2026-08-15T00:00:00.000Z'),
      cityId: 'cairo',
      activities: [], images: [], budgetEntries: [], transportEntries: [], bookingAssociations: [],
    }], { budgetEntries: [] });
    const owner = { sub: '64b000000000000000000001', role: 'user' } as any;
    mockOwnedItinerary(itinerary);
    flightBookings.get.mockResolvedValue({
      _id: bookingId,
      status: 'confirmed',
      totalMinor: 12345,
      currency: 'USD',
      legs: [{ flightNumber: 'TP101', departureAt: new Date('2026-08-15T08:00:00.000Z'), departureTimeZone: 'UTC' }],
    });

    const response = await service.associateFlightBooking(
      String(itinerary._id), 1, { bookingId: String(bookingId) } as any, owner,
    );
    expect(flightBookings.get).toHaveBeenCalledWith(String(bookingId), {
      id: owner.sub, roles: ['user'], airlineIds: [],
    });
    expect(itinerary.days[0].bookingAssociations).toHaveLength(1);
    expect(response.days[0].bookingAssociations[0]).toMatchObject({
      status: 'confirmed', amount: 123.45, currency: 'USD', includedInBudget: true,
    });

    const summary = await service.getBudgetSummary(String(itinerary._id), owner);
    expect(summary.totalsByCurrency).toEqual([{ currency: 'USD', amount: 123.45 }]);
    expect(summary.categoryTotals.find((item: any) => item.category === 'intercity_transportation')?.totalsByCurrency)
      .toEqual([{ currency: 'USD', amount: 123.45 }]);
    expect(summary.dayTotals[0].linkedBookings).toHaveLength(1);
    await expect(service.associateFlightBooking(
      String(itinerary._id), 1, { bookingId: String(bookingId) } as any, owner,
    )).rejects.toBeInstanceOf(ConflictException);

    await service.removeFlightBookingAssociation(String(itinerary._id), 1, String(bookingId), owner);
    expect(itinerary.days[0].bookingAssociations).toHaveLength(0);
    expect(flightBookings.cancel).not.toHaveBeenCalled();
    const afterRemoval = await service.getBudgetSummary(String(itinerary._id), owner);
    expect(afterRemoval.totalsByCurrency).toEqual([]);
  });

  it('rejects non-user, non-confirmed, and date-mismatched flight booking associations', async () => {
    const bookingId = new mongoose.Types.ObjectId();
    const itinerary = makeItinerary([{
      order: 1, date: new Date('2026-08-15T00:00:00.000Z'), cityId: 'cairo',
      activities: [], images: [], budgetEntries: [], transportEntries: [], bookingAssociations: [],
    }]);
    mockOwnedItinerary(itinerary);
    vi.spyOn(service as any, 'getOwnedItinerary').mockRejectedValueOnce(new ForbiddenException());
    await expect(service.associateFlightBooking(String(itinerary._id), 1, { bookingId: String(bookingId) } as any, {
      sub: '64b000000000000000000001', role: 'user',
    } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(flightBookings.get).not.toHaveBeenCalled();
    await expect(service.associateFlightBooking(String(itinerary._id), 1, { bookingId: String(bookingId) } as any, {
      sub: '64b000000000000000000001', role: 'admin',
    } as any)).rejects.toBeInstanceOf(ForbiddenException);
    flightBookings.get.mockResolvedValue({ status: 'pending-payment', legs: [] });
    await expect(service.associateFlightBooking(String(itinerary._id), 1, { bookingId: String(bookingId) } as any, {
      sub: '64b000000000000000000001', role: 'user',
    } as any)).rejects.toBeInstanceOf(ConflictException);
    flightBookings.get.mockResolvedValue({
      status: 'confirmed', totalMinor: 1000, currency: 'USD',
      legs: [{ departureAt: new Date('2026-08-16T08:00:00.000Z'), departureTimeZone: 'UTC' }],
    });
    await expect(service.associateFlightBooking(String(itinerary._id), 1, { bookingId: String(bookingId) } as any, {
      sub: '64b000000000000000000001', role: 'user',
    } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(itinerary.days[0].bookingAssociations).toHaveLength(0);
  });

  it('exports a readable PDF only for the itinerary owner', async () => {
    const itinerary = makeItinerary([{
      order: 1, date: new Date('2026-02-01T00:00:00.000Z'), cityId: 'cairo', notes: 'Visit the museum',
      activities: [{ name: 'Museum', cost: { amount: 20, currency: 'EGP' } }],
      transportEntries: [{ mode: 'train', fromCityId: 'cairo', toCityId: 'giza', amount: 10, currency: 'EGP' }],
      budgetEntries: [], bookingAssociations: [],
    }], { title: 'Cairo visit' });
    mockOwnedItinerary(itinerary);
    const buffer = await service.exportPdf(String(itinerary._id), { sub: '64b000000000000000000001' } as any);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.toString('latin1')).toMatch(/\/Type \/Page\b/);
    vi.spyOn(service as any, 'getOwnedItinerary').mockRejectedValue(new ForbiddenException());
    await expect(service.exportPdf(String(itinerary._id), { sub: '64b000000000000000000009' } as any))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('exports long itineraries across multiple PDF pages', async () => {
    const days = Array.from({ length: 60 }, (_, index) => ({
      order: index + 1,
      date: new Date(Date.UTC(2026, 0, 1 + index)),
      cityId: index % 2 ? 'cairo' : 'giza',
      notes: 'A detailed travel day. '.repeat(30),
      activities: [], images: [], budgetEntries: [], transportEntries: [], bookingAssociations: [],
    }));
    const itinerary = makeItinerary(days, { title: 'Long journey', budgetEntries: [] });
    mockOwnedItinerary(itinerary);
    const buffer = await service.exportPdf(String(itinerary._id), { sub: '64b000000000000000000001' } as any);
    const pageCount = (buffer.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount).toBeGreaterThan(1);
  });

  it('rejects bulk day replacement when booking associations exist without mutating them', async () => {
    const association = { type: 'flight', bookingId: new mongoose.Types.ObjectId() };
    const itinerary = makeItinerary([{
      order: 1,
      date: new Date('2026-02-01T00:00:00Z'),
      cityId: 'cairo',
      city: undefined,
      budgetEntries: [],
      transportEntries: [],
      bookingAssociations: [association],
    }]);
    mockOwnedItinerary(itinerary);
    await expect(service.updateDays(String(itinerary._id), { days: [] } as any, {
      sub: '64b000000000000000000001',
    } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(itinerary.days[0].bookingAssociations).toEqual([association]);
    expect(itinerary.save).not.toHaveBeenCalled();
  });

  it('searches public itineraries with public-only filtering, canonical reference filters, keyword matches, and duration bounds', async () => {
    const results = [{
      _id: new mongoose.Types.ObjectId(),
      title: 'Cairo Walk',
      countryCodes: ['EG'],
      startDate: new Date('2026-01-01T00:00:00Z'),
      days: [{ order: 1, cityId: 'cairo' }, { order: 2, cityId: 'cairo' }],
      userId: new mongoose.Types.ObjectId(),
      passwordHash: 'must not be exposed',
    }];
    const queryChain: any = {};
    for (const method of ['select', 'sort', 'skip', 'limit', 'lean']) {
      queryChain[method] = vi.fn(() => queryChain);
    }
    queryChain.exec = vi.fn().mockResolvedValue(results);
    const model = (service as any).itineraryModel;
    model.find = vi.fn().mockReturnValue(queryChain);
    model.countDocuments = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(1) });
    reference.countries.mockResolvedValue({ data: [{ _id: 'EG' }], total: 1 });
    reference.cities.mockResolvedValue({ data: [{ _id: 'cairo' }], total: 1 });

    const response = await service.searchPublic({
      keyword: 'Cairo', country: 'eg', city: 'cairo', minDays: 2, maxDays: 4,
      page: 1, limit: 10,
    } as any);

    const filter = model.find.mock.calls[0][0];
    expect(filter.visibility).toBe('public');
    expect(filter.$and).toEqual(expect.arrayContaining([
      { countryCodes: 'EG' },
      { 'days.cityId': 'cairo' },
      expect.objectContaining({ $or: expect.arrayContaining([{ countryCodes: { $in: ['EG'] } }, { 'days.cityId': { $in: ['cairo'] } }]) }),
      expect.objectContaining({ $expr: expect.any(Object) }),
    ]));
    expect(queryChain.select).toHaveBeenCalledWith('_id title description countryCodes startDate days.order days.cityId updatedAt');
    expect(queryChain.sort).toHaveBeenCalledWith({ updatedAt: -1, _id: 1 });
    expect(response).toMatchObject({ total: 1, data: [{ title: 'Cairo Walk', durationDays: 2, cityIds: ['cairo'] }] });
    expect(response.data[0]).not.toHaveProperty('userId');
    expect(response.data[0]).not.toHaveProperty('passwordHash');
  });

  it('rejects an inverted public-search duration range', async () => {
    await expect(service.searchPublic({ minDays: 5, maxDays: 2, page: 1, limit: 10 } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    expect((service as any).itineraryModel.find).toBeUndefined();
  });

  it('allows an owner to switch visibility and retains the private schema default', async () => {
    const itinerary = makeItinerary([], { visibility: 'private' });
    mockOwnedItinerary(itinerary);
    const response = await service.updateItinerary(
      '64b000000000000000000002',
      { visibility: 'public' } as any,
      { sub: '64b000000000000000000001' } as any,
    );
    expect(itinerary.visibility).toBe('public');
    expect(response.visibility).toBe('public');
    expect(ItinerarySchema.path('visibility')?.defaultValue).toBe('private');

    const invalid = plainToInstance(UpdateItineraryDto, { visibility: 'friends' });
    expect(await validate(invalid)).not.toEqual([]);
    const nullVisibility = plainToInstance(UpdateItineraryDto, { visibility: null });
    expect(await validate(nullVisibility)).not.toEqual([]);
  });

  it('validates public search duration and pagination inputs', async () => {
    const invalid = plainToInstance(PublicItinerarySearchDto, {
      minDays: 61, maxDays: -1, limit: 11, page: 0,
    });
    expect(await validate(invalid)).not.toEqual([]);
    const valid = plainToInstance(PublicItinerarySearchDto, {
      minDays: 0, maxDays: 60, country: 'EG', city: 'cairo', limit: 10,
    });
    expect(await validate(valid)).toEqual([]);
  });

  it('searches hotels for the selected consecutive city group using derived dates and supports repeated city groups', async () => {
    const itinerary = makeItinerary([
      { order: 1, date: new Date('2026-01-30T00:00:00Z'), cityId: 'cairo' },
      { order: 2, date: new Date('2026-01-31T00:00:00Z'), cityId: 'cairo' },
      { order: 3, date: new Date('2026-02-01T00:00:00Z'), cityId: 'alexandria' },
      { order: 4, date: new Date('2026-02-02T00:00:00Z'), cityId: 'cairo' },
    ]);
    mockOwnedItinerary(itinerary);
    reference.city.mockImplementation(async (id: string) => ({
      _id: id, name: id === 'cairo' ? 'Cairo' : 'Alexandria', countryCode: 'EG',
    }));
    reference.country.mockResolvedValue({ _id: 'EG', name: 'Egypt' });
    const query = plainToInstance(ItineraryHotelSearchDto, { guests: '3', rooms: '2' });

    const first = await service.searchHotelsForCityGroup(
      '64b000000000000000000002', 1, query, { sub: '64b000000000000000000001' } as any,
    );
    const laterSameCity = await service.searchHotelsForCityGroup(
      '64b000000000000000000002', 4, query, { sub: '64b000000000000000000001' } as any,
    );

    expect(first.cityGroup).toMatchObject({ startDayOrder: 1, endDayOrder: 2, dayCount: 2, checkIn: '2026-01-30', checkOut: '2026-02-01' });
    expect(laterSameCity.cityGroup).toMatchObject({ startDayOrder: 4, endDayOrder: 4, checkIn: '2026-02-02', checkOut: '2026-02-03' });
    expect(hotelsService.search).toHaveBeenCalledTimes(2);
    expect(hotelsService.search.mock.calls[0][0]).toMatchObject({ city: 'Cairo', country: 'Egypt', checkIn: '2026-01-30', checkOut: '2026-02-01', guests: 3, rooms: 2 });
    expect(hotelsService.search.mock.calls[1][0]).toMatchObject({ city: 'Cairo', checkIn: '2026-02-02', checkOut: '2026-02-03' });
  });

  it('rejects missing or inconsistent hotel dates/cities, nonexistent groups, and non-owner access', async () => {
    const user = { sub: '64b000000000000000000001' } as any;
    const query = plainToInstance(ItineraryHotelSearchDto, { guests: 1, rooms: 1 });
    mockOwnedItinerary(makeItinerary([{ order: 1, date: new Date('2026-01-31T00:00:00Z'), cityId: 'cairo' }]));
    await expect(service.searchHotelsForCityGroup('64b000000000000000000002', 1, query, user))
      .rejects.toThrow('Stored itinerary day dates are inconsistent');
    expect(hotelsService.search).not.toHaveBeenCalled();

    mockOwnedItinerary(makeItinerary([{ order: 1, date: new Date('2026-01-30T00:00:00Z'), city: 'Legacy only' }]));
    await expect(service.searchHotelsForCityGroup('64b000000000000000000002', 1, query, user))
      .rejects.toThrow('A day has no canonical city');

    mockOwnedItinerary(makeItinerary([{ order: 1, date: new Date('2026-01-30T00:00:00Z'), cityId: 'cairo' }]));
    await expect(service.searchHotelsForCityGroup('64b000000000000000000002', 2, query, user))
      .rejects.toBeInstanceOf(NotFoundException);
    vi.spyOn(service as any, 'getOwnedItinerary').mockRejectedValueOnce(new ForbiddenException());
    await expect(service.searchHotelsForCityGroup('64b000000000000000000002', 1, query, user))
      .rejects.toBeInstanceOf(ForbiddenException);

    const invalidGuests = plainToInstance(ItineraryHotelSearchDto, { guests: 0, rooms: 1 });
    const invalidRooms = plainToInstance(ItineraryHotelSearchDto, { guests: 1, rooms: 11 });
    expect(await validate(invalidGuests)).not.toEqual([]);
    expect(await validate(invalidRooms)).not.toEqual([]);
  });

  it('searches flights from the selected origin to every mapped first-day airport with itinerary date defaults', async () => {
    const itinerary = makeItinerary([
      { order: 1, date: new Date('2026-08-14T00:00:00Z'), cityId: 'cairo' },
      { order: 2, date: new Date('2026-08-15T00:00:00Z'), cityId: 'alexandria' },
      { order: 3, date: new Date('2026-08-16T00:00:00Z'), cityId: 'luxor' },
    ], { startDate: new Date('2026-08-14T00:00:00Z') });
    mockOwnedItinerary(itinerary);
    reference.city.mockResolvedValue({ _id: 'cairo', name: 'Cairo', countryCode: 'EG' });
    airportsService.byCode.mockResolvedValue({ code: 'CAI', name: 'Cairo International', city: 'Cairo', cityId: 'cairo', country: 'Egypt' });
    airportsService.find.mockResolvedValue({
      data: [
        { code: 'CAI', name: 'Cairo International', cityId: 'cairo' },
        { code: 'HBE', name: 'Borg El Arab', cityId: 'cairo' },
        { code: 'SPX', name: 'Sphinx', cityId: 'cairo' },
      ],
      total: 3,
    });
    const query = Object.assign(new ItineraryFlightSearchDto(), {
      departureAirport: 'CAI', tripType: 'round-trip',
    });

    const response = await service.searchFlightsForItinerary(
      '64b000000000000000000002', query, { sub: '64b000000000000000000001' } as any,
    );

    expect(airportsService.find).toHaveBeenCalledWith({ city: 'cairo', page: 1, limit: 100 });
    expect(flightsService.search).toHaveBeenCalledTimes(2);
    expect(flightsService.search.mock.calls.map(([request]) => request)).toEqual(expect.arrayContaining([
      expect.objectContaining({ departureAirport: 'CAI', arrivalAirport: 'HBE', departureDate: '2026-08-14', tripType: 'round-trip', returnDate: '2026-08-16' }),
      expect.objectContaining({ departureAirport: 'CAI', arrivalAirport: 'SPX', departureDate: '2026-08-14', tripType: 'round-trip', returnDate: '2026-08-16' }),
    ]));
    expect(response.options.map((option: any) => option.arrivalAirport.code)).toEqual(['HBE', 'SPX']);
  });

  it('validates flight airport choices, missing mappings, dates, and ownership', async () => {
    const user = { sub: '64b000000000000000000001' } as any;
    const itinerary = makeItinerary([{ order: 1, date: new Date('2026-01-30T00:00:00Z'), cityId: 'cairo' }]);
    mockOwnedItinerary(itinerary);
    reference.city.mockResolvedValue({ _id: 'cairo', name: 'Cairo', countryCode: 'EG' });
    airportsService.find.mockResolvedValue({ data: [], total: 0 });
    const query = Object.assign(new ItineraryFlightSearchDto(), { departureAirport: 'CAI' });
    await expect(service.searchFlightsForItinerary('64b000000000000000000002', query, user))
      .rejects.toThrow('No airport mapping exists');

    airportsService.find.mockResolvedValue({ data: [{ code: 'HBE', cityId: 'cairo' }], total: 1 });
    const invalidDestination = Object.assign(new ItineraryFlightSearchDto(), { departureAirport: 'CAI', arrivalAirport: 'SPX' });
    await expect(service.searchFlightsForItinerary('64b000000000000000000002', invalidDestination, user))
      .rejects.toThrow('arrivalAirport is not mapped');

    const invalidDate = Object.assign(new ItineraryFlightSearchDto(), { departureAirport: 'CAI', departureDate: '2026-02-30' });
    await expect(service.searchFlightsForItinerary('64b000000000000000000002', invalidDate, user))
      .rejects.toThrow('startDate is not a valid calendar date');

    vi.spyOn(service as any, 'getOwnedItinerary').mockRejectedValueOnce(new ForbiddenException());
    await expect(service.searchFlightsForItinerary('64b000000000000000000002', query, user))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(flightsService.search).not.toHaveBeenCalled();
  });

  it('returns public details with safe author and city information while private details stay inaccessible', async () => {
    const itineraryId = new mongoose.Types.ObjectId();
    const ownerId = new mongoose.Types.ObjectId();
    const publicDocument: any = {
      _id: itineraryId,
      userId: ownerId,
      title: 'Cairo trip',
      countryCodes: ['EG'],
      destinations: ['Legacy destination text'],
      startDate: new Date('2026-01-01T00:00:00Z'),
      visibility: 'public',
      passwordHash: 'never expose this',
      days: [{ order: 1, date: new Date('2026-01-01T00:00:00Z'), cityId: 'cairo',
        internalField: 'never expose nested internals',
        activities: [{ _id: new mongoose.Types.ObjectId(), title: 'Museum', cost: { amount: 10, currency: 'EGP' }, images: [] }],
        budgetEntries: [{ _id: new mongoose.Types.ObjectId(), category: 'food', amount: 5, currency: 'EGP' }],
        transportEntries: [{ _id: new mongoose.Types.ObjectId(), mode: 'train', fromCityId: 'cairo', toCityId: 'alexandria', amount: 20, currency: 'EGP' }] }],
      budgetEntries: [{ category: 'accommodation', amount: 30, currency: 'EGP' }],
    };
    const model = (service as any).itineraryModel;
    model.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(publicDocument) });
    usersService.findById.mockResolvedValue({ _id: ownerId, firstName: 'Alex', lastName: 'Morgan', email: 'private@example.test' });
    reference.city.mockImplementation(async (id: string) => ({
      _id: id, name: id === 'cairo' ? 'Cairo' : 'Alexandria', countryCode: 'EG',
    }));

    const response = await service.getPublicDetails(String(itineraryId));
    expect(model.findOne).toHaveBeenCalledWith({ _id: itineraryId, visibility: 'public' });
    expect(response.author).toEqual({ id: String(ownerId), name: 'Alex Morgan' });
    expect(response.days[0].cityInfo).toEqual({ id: 'cairo', name: 'Cairo', countryCode: 'EG' });
    expect(response.days[0].transportEntries[0].toCityInfo.name).toBe('Alexandria');
    expect(response.days[0].activities[0].cost).toEqual({ amount: 10, currency: 'EGP' });
    expect(response.budgetEntries).toHaveLength(1);
    expect(response.budgetSummary.totalsByCurrency).toEqual([{ currency: 'EGP', amount: 65 }]);
    expect(response.legacyData).toEqual({ destinations: ['Legacy destination text'] });
    expect(response).not.toHaveProperty('userId');
    expect(response).not.toHaveProperty('visibility');
    expect(response.days[0]).not.toHaveProperty('internalField');
    expect(JSON.stringify(response)).not.toContain('private@example.test');
    expect(JSON.stringify(response)).not.toContain('never expose');

    model.findOne.mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(null) });
    await expect(service.getPublicDetails(String(itineraryId))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('clones only public itineraries into private independent copies with attribution and fresh nested IDs', async () => {
    const RealModel = mongoose.model(`PublicCloneSpec${Date.now()}`, ItinerarySchema);
    const sourceId = new mongoose.Types.ObjectId();
    const authorId = new mongoose.Types.ObjectId();
    const otherOwner = new mongoose.Types.ObjectId();
    const sourceDayId = new mongoose.Types.ObjectId();
    const source: any = {
      _id: sourceId,
      userId: authorId,
      title: 'Shared trip',
      description: 'Source description',
      countryCodes: ['EG'],
      destinations: ['Legacy destination'],
      startDate: new Date('2026-01-01T00:00:00Z'),
      visibility: 'public',
      days: [{ _id: sourceDayId, order: 1, date: new Date('2026-01-01T00:00:00Z'), cityId: 'cairo', city: 'Legacy Cairo',
        notes: 'Day notes', images: ['day.png'],
        activities: [{ _id: new mongoose.Types.ObjectId(), title: 'Museum', images: ['activity.png'], cost: { amount: 10, currency: 'EGP' } }],
        budgetEntries: [{ _id: new mongoose.Types.ObjectId(), category: 'food', amount: 5, currency: 'EGP' }],
        transportEntries: [{ _id: new mongoose.Types.ObjectId(), mode: 'train', fromCityId: 'cairo', toCityId: 'alexandria', amount: 20, currency: 'EGP' }] }],
      budgetEntries: [{ _id: new mongoose.Types.ObjectId(), category: 'accommodation', amount: 30, currency: 'EGP' }],
    };
    const sourceActivityId = String(source.days[0].activities[0]._id);
    const sourceDaySubdocumentId = String(source.days[0]._id);
    const sourceDayBudgetId = String(source.days[0].budgetEntries[0]._id);
    const sourceTransportId = String(source.days[0].transportEntries[0]._id);
    const sourceTopBudgetId = String(source.budgetEntries[0]._id);
    const constructed: any[] = [];
    const model: any = function (data: any) {
      const document: any = new RealModel(data);
      document.save = vi.fn(async () => document);
      constructed.push(document);
      return document;
    };
    model.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(source) });
    (service as any).itineraryModel = model;
    usersService.findById.mockResolvedValue({ _id: authorId, firstName: 'Original', lastName: 'Author' });

    const cloneResponse = await service.clonePublicItinerary(String(sourceId), { sub: String(otherOwner) } as any);
    const clone = constructed[0];
    expect(clone.visibility).toBe('private');
    expect(clone.status).toBe('draft');
    expect(String(clone.userId)).toBe(String(otherOwner));
    expect(cloneResponse.clonedFrom).toEqual({ itineraryId: String(sourceId), authorId: String(authorId), authorName: 'Original Author' });
    expect(String(clone.days[0]._id)).not.toBe(sourceDaySubdocumentId);
    expect(String(clone.days[0].activities[0]._id)).not.toBe(sourceActivityId);
    expect(String(clone.days[0].budgetEntries[0]._id)).not.toBe(sourceDayBudgetId);
    expect(String(clone.days[0].transportEntries[0]._id)).not.toBe(sourceTransportId);
    expect(String(clone.budgetEntries[0]._id)).not.toBe(sourceTopBudgetId);
    expect(clone.days[0].city).toBe('Legacy Cairo');
    expect(clone.destinations).toEqual(['Legacy destination']);
    expect(clone.days[0].notes).toBe('Day notes');
    expect(clone.days[0].activities[0].images).toEqual(['activity.png']);

    source.days[0].activities[0].title = 'Changed source';
    source.budgetEntries[0].amount = 999;
    expect(clone.days[0].activities[0].title).toBe('Museum');
    expect(clone.budgetEntries[0].amount).toBe(30);

    model.findOne.mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(null) });
    await expect(service.clonePublicItinerary(String(sourceId), { sub: String(otherOwner) } as any))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(constructed).toHaveLength(1);
  });

  it('creates a generated-ID activity on the selected day and validates its optional cost currency', async () => {
    const day = { order: 1, date: new Date('2026-04-10T00:00:00.000Z'), cityId: 'cairo', activities: [], budgetEntries: [] };
    const itinerary = makeItinerary([day]);
    mockOwnedItinerary(itinerary);
    const user = { sub: '64b000000000000000000001' } as any;

    const response = await service.createActivity(
      '64b000000000000000000002',
      1,
      { title: ' Museum ', description: 'A visit', startTime: '09:00', cost: { amount: 12, currency: 'egp' } } as any,
      user,
    );

    expect(day.activities).toHaveLength(1);
    expect(day.activities[0]._id).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(day.activities[0]).toMatchObject({
      title: ' Museum ', description: 'A visit', startTime: '09:00',
      cost: { amount: 12, currency: 'EGP' }, images: [],
    });
    expect(reference.isSupportedCurrency).toHaveBeenCalledWith('EGP');
    expect(itinerary.save).toHaveBeenCalledOnce();
    expect(String(response.days[0].activities[0]._id)).toBe(String(day.activities[0]._id));
    expect(response.budgetEntries).toEqual(itinerary.budgetEntries);
  });

  it('attaches and removes activity images through the shared upload service', async () => {
    const activityId = new mongoose.Types.ObjectId();
    const imageId = '64b0000000000000000000bb';
    const url = 'http://localhost:3000/api/uploads/files/abcdef0123456789abcdef0123456789.png';
    const activity = { _id: activityId, title: 'Museum', images: [] as string[] };
    const itinerary = makeItinerary([{ order: 1, cityId: 'cairo', activities: [activity] }]);
    mockOwnedItinerary(itinerary);
    uploadsService.validateAndStore.mockResolvedValue({ id: imageId, url });
    uploadsService.get.mockResolvedValue({ id: imageId, url, purpose: 'activity', entityId: String(activityId) });
    uploadsService.remove.mockResolvedValue(undefined);

    const file = { buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), mimetype: 'image/png' } as Express.Multer.File;
    const attached = await service.addActivityImage('64b000000000000000000002', 1, String(activityId), file, {
      sub: '64b000000000000000000001',
    } as any);
    expect(attached).toMatchObject({ id: imageId, url });
    expect(activity.images).toEqual([url]);
    expect(uploadsService.validateAndStore).toHaveBeenCalledWith(file, {
      purpose: 'activity',
      entityId: String(activityId),
      user: expect.objectContaining({ sub: '64b000000000000000000001' }),
    });

    const removed = await service.removeActivityImage(
      '64b000000000000000000002',
      1,
      String(activityId),
      imageId,
      { sub: '64b000000000000000000001' } as any,
    );
    expect(removed).toMatchObject({ deleted: true, id: imageId });
    expect(activity.images).toEqual([]);
    expect(uploadsService.remove).toHaveBeenCalledWith(imageId, expect.objectContaining({ sub: '64b000000000000000000001' }));
  });

  it('edits only supplied activity fields while preserving its ID, images, other activities, and budgets', async () => {
    const activityId = new mongoose.Types.ObjectId();
    const otherId = new mongoose.Types.ObjectId();
    const selected = { _id: activityId, title: 'Old', description: 'Keep unless supplied', images: ['old.jpg'], cost: { amount: 5, currency: 'USD' }, extra: 'retain' };
    const other = { _id: otherId, title: 'Other', images: ['other.jpg'], cost: { amount: 3, currency: 'EGP' } };
    const budgetEntries = [{ category: 'food', amount: 20, currency: 'EGP' }];
    const day = { order: 1, date: new Date('2026-04-10T00:00:00.000Z'), cityId: 'cairo', activities: [selected, other], budgetEntries };
    const itinerary = makeItinerary([day]);
    mockOwnedItinerary(itinerary);

    const response = await service.updateActivity(
      '64b000000000000000000002', 1, String(activityId),
      { title: 'Updated', cost: { amount: 15, currency: 'usd' } } as any,
      { sub: '64b000000000000000000001' } as any,
    );

    expect(selected).toMatchObject({
      _id: activityId, title: 'Updated', description: 'Keep unless supplied',
      images: ['old.jpg'], extra: 'retain', cost: { amount: 15, currency: 'USD' },
    });
    expect(day.activities[1]).toBe(other);
    expect(day.budgetEntries).toBe(budgetEntries);
    const summary = (service as any).calculateBudgetSummary(itinerary);
    expect(summary.totalsByCurrency).toEqual([
      { currency: 'EGP', amount: 48 },
      { currency: 'USD', amount: 15 },
    ]);
    expect(String(response.days[0].activities[0]._id)).toBe(String(activityId));
  });

  it('deletes only the selected activity and preserves other activities and budget data', async () => {
    const selected = { _id: new mongoose.Types.ObjectId(), title: 'Remove', cost: { amount: 10, currency: 'EGP' }, images: ['remove.jpg'] };
    const remaining = { _id: new mongoose.Types.ObjectId(), title: 'Keep', cost: { amount: 7, currency: 'USD' }, images: ['keep.jpg'] };
    const budgetEntries = [{ category: 'food', amount: 22, currency: 'EGP' }];
    const day = { order: 1, date: new Date('2026-04-10T00:00:00.000Z'), cityId: 'cairo', activities: [selected, remaining], budgetEntries };
    const itinerary = makeItinerary([day]);
    mockOwnedItinerary(itinerary);

    const response = await service.deleteActivity(
      '64b000000000000000000002', 1, String(selected._id),
      { sub: '64b000000000000000000001' } as any,
    );

    expect(day.activities).toEqual([remaining]);
    expect(day.budgetEntries).toBe(budgetEntries);
    const summary = (service as any).calculateBudgetSummary(itinerary);
    expect(summary.totalsByCurrency).toEqual([
      { currency: 'EGP', amount: 47 },
      { currency: 'USD', amount: 7 },
    ]);
    expect(response.days[0].activities).toHaveLength(1);
  });

  it('returns not-found for missing itinerary, day, or activity and forbids a non-owner', async () => {
    const id = '64b000000000000000000002';
    const activityId = new mongoose.Types.ObjectId().toString();
    const user = { sub: '64b000000000000000000001' } as any;

    vi.spyOn(service as any, 'getOwnedItinerary').mockRejectedValueOnce(new NotFoundException());
    await expect(service.createActivity(id, 1, { title: 'Walk' } as any, user)).rejects.toBeInstanceOf(NotFoundException);
    vi.spyOn(service as any, 'getOwnedItinerary').mockRejectedValueOnce(new ForbiddenException());
    await expect(service.createActivity(id, 1, { title: 'Walk' } as any, user)).rejects.toBeInstanceOf(ForbiddenException);

    mockOwnedItinerary(makeItinerary([]));
    await expect(service.createActivity(id, 1, { title: 'Walk' } as any, user)).rejects.toBeInstanceOf(NotFoundException);
    mockOwnedItinerary(makeItinerary([{ order: 1, activities: [] }]));
    await expect(service.updateActivity(id, 1, activityId, { title: 'Changed' } as any, user)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteActivity(id, 1, activityId, user)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects invalid activity IDs, day orders, empty patches, invalid costs, and unsupported currencies', async () => {
    const id = '64b000000000000000000002';
    const user = { sub: '64b000000000000000000001' } as any;
    const existing = { _id: new mongoose.Types.ObjectId(), title: 'Keep', cost: { amount: 4, currency: 'USD' } };
    const day = { order: 1, activities: [existing] };
    const itinerary = makeItinerary([day]);
    mockOwnedItinerary(itinerary);

    await expect(service.createActivity(id, 0, { title: 'Bad' } as any, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateActivity(id, 1, 'bad-id', { title: 'Bad' } as any, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateActivity(id, 1, String(existing._id), {} as any, user)).rejects.toBeInstanceOf(BadRequestException);
    for (const cost of [{ amount: -1, currency: 'EGP' }, { amount: Number.NaN, currency: 'EGP' }, { amount: 1, currency: 'US' }]) {
      await expect(service.createActivity(id, 1, { title: 'Bad', cost } as any, user)).rejects.toBeInstanceOf(BadRequestException);
    }
    reference.isSupportedCurrency.mockResolvedValueOnce(false);
    await expect(service.createActivity(id, 1, { title: 'Bad', cost: { amount: 1, currency: 'ZZZ' } } as any, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(day.activities).toEqual([existing]);
    expect(existing).toMatchObject({ title: 'Keep', cost: { amount: 4, currency: 'USD' } });
  });

  it('validates activity DTO fields and rejects null or malformed costs', async () => {
    const createValid = plainToInstance(CreateItineraryActivityDto, { title: 'Walk', startTime: '09:30', cost: { amount: 0, currency: 'EGP' } });
    expect(await validate(createValid)).toHaveLength(0);
    for (const payload of [
      { title: '' },
      { title: '   ' },
      { title: 'Walk', description: null },
      { title: 'Walk', cost: null },
      { title: 'Walk', cost: { amount: -1, currency: 'EGP' } },
      { title: 'Walk', cost: { amount: 1, currency: 'US' } },
    ]) {
      const dto = plainToInstance(CreateItineraryActivityDto, payload);
      expect(await validate(dto)).not.toHaveLength(0);
    }
    const patch = plainToInstance(UpdateItineraryActivityDto, { description: 'Updated' });
    expect(await validate(patch)).toHaveLength(0);
  });

  it('creates a day budget entry with a generated subdocument ID and preserves legacy expenses and activity costs', async () => {
    const Model = mongoose.model('ItineraryBudgetEntryCreateFixture', ItinerarySchema);
    const itinerary = new Model({
      title: 'Budget fixture',
      userId: new mongoose.Types.ObjectId('64b000000000000000000001'),
      startDate: new Date('2026-01-30T00:00:00.000Z'),
      days: [{ order: 1, date: new Date('2026-01-30T00:00:00.000Z'), cityId: 'cairo', activities: [{ title: 'Tour', cost: { amount: 30, currency: 'EGP' } }] }],
      budgetEntries: [{ category: 'food', amount: 15, currency: 'EGP' }],
    });
    vi.spyOn(itinerary, 'save').mockResolvedValue(itinerary as any);
    mockOwnedItinerary(itinerary);

    const response = await service.createDayBudgetEntry(
      String(itinerary._id),
      1,
      { category: 'food', amount: 12, currency: 'egp', description: 'Lunch' } as any,
      { sub: '64b000000000000000000001' } as any,
    );

    const created = itinerary.days[0].budgetEntries[0] as any;
    expect(mongoose.Types.ObjectId.isValid(String(created._id))).toBe(true);
    expect(created.toObject()).toMatchObject({
      category: 'food', amount: 12, currency: 'EGP', description: 'Lunch',
    });
    expect(String(response.days[0].budgetEntries[0]._id)).toBe(String(created._id));
    expect(itinerary.budgetEntries).toHaveLength(1);
    expect(itinerary.budgetEntries[0].amount).toBe(15);
    expect(itinerary.days[0].activities[0].cost).toMatchObject({ amount: 30, currency: 'EGP' });
    expect(reference.isSupportedCurrency).toHaveBeenCalledWith('EGP');
  });

  it('updates only supplied budget entry fields and deletes by generated subdocument ID', async () => {
    const entryId = new mongoose.Types.ObjectId();
    const entry = { _id: entryId, category: 'food', amount: 12, currency: 'EGP', description: 'Lunch', retained: true };
    const day = { order: 1, date: new Date(), cityId: 'cairo', budgetEntries: [entry] };
    const legacyEntries = [{ category: 'food', amount: 25, currency: 'EGP' }];
    const activityCost = { amount: 45, currency: 'EGP' };
    const itinerary = makeItinerary([day], { budgetEntries: legacyEntries });
    day.activities = [{ title: 'Tour', cost: activityCost }];
    mockOwnedItinerary(itinerary);

    const response = await service.updateDayBudgetEntry(
      '64b000000000000000000002', 1, entryId.toString(),
      { amount: 14 } as any,
      { sub: '64b000000000000000000001' } as any,
    );
    expect(entry).toMatchObject({ amount: 14, category: 'food', currency: 'EGP', description: 'Lunch', retained: true });
    expect(response.days[0].budgetEntries[0].amount).toBe(14);
    expect(itinerary.budgetEntries).toBe(legacyEntries);
    expect(day.activities[0].cost).toBe(activityCost);

    await service.deleteDayBudgetEntry(
      '64b000000000000000000002', 1, entryId.toString(),
      { sub: '64b000000000000000000001' } as any,
    );
    expect(day.budgetEntries).toEqual([]);
    expect(itinerary.budgetEntries).toBe(legacyEntries);
    expect(day.activities[0].cost).toBe(activityCost);
    expect(itinerary.save).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid, unsupported, empty, or missing budget-entry operations safely', async () => {
    const entryId = new mongoose.Types.ObjectId();
    const itinerary = makeItinerary([{ order: 1, budgetEntries: [{ _id: entryId, amount: 5, category: 'food', currency: 'EGP' }] }]);
    mockOwnedItinerary(itinerary);

    await expect(service.createDayBudgetEntry('64b000000000000000000002', 0, {} as any, { sub: 'owner' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createDayBudgetEntry('64b000000000000000000002', 2, {} as any, { sub: 'owner' } as any))
      .rejects.toBeInstanceOf(NotFoundException);
    reference.isSupportedCurrency.mockResolvedValueOnce(false);
    await expect(service.createDayBudgetEntry('64b000000000000000000002', 1, { category: 'food', amount: 1, currency: 'ZZZ' } as any, { sub: 'owner' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateDayBudgetEntry('64b000000000000000000002', 1, entryId.toString(), {} as any, { sub: 'owner' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateDayBudgetEntry('64b000000000000000000002', 1, 'bad-id', { amount: 3 } as any, { sub: 'owner' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateDayBudgetEntry('64b000000000000000000002', 2, entryId.toString(), { amount: 3 } as any, { sub: 'owner' } as any))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateDayBudgetEntry('64b000000000000000000002', 1, new mongoose.Types.ObjectId().toString(), { amount: 3 } as any, { sub: 'owner' } as any))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteDayBudgetEntry('64b000000000000000000002', 1, new mongoose.Types.ObjectId().toString(), { sub: 'owner' } as any))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteDayBudgetEntry('64b000000000000000000002', 0, entryId.toString(), { sub: 'owner' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('applies itinerary ownership checks to budget-entry CRUD', async () => {
    const model = (service as any).itineraryModel;
    model.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ userId: '64b000000000000000000009' }) });
    const user = { sub: '64b000000000000000000001' } as any;
    await expect(service.createDayBudgetEntry('64b000000000000000000002', 1, {} as any, user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateDayBudgetEntry('64b000000000000000000002', 1, new mongoose.Types.ObjectId().toString(), { amount: 2 } as any, user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.deleteDayBudgetEntry('64b000000000000000000002', 1, new mongoose.Types.ObjectId().toString(), user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns 404 when budget-entry CRUD targets a missing itinerary', async () => {
    const model = (service as any).itineraryModel;
    model.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
    const user = { sub: '64b000000000000000000001' } as any;
    const entryId = new mongoose.Types.ObjectId().toString();

    await expect(service.createDayBudgetEntry(
      '64b000000000000000000002', 1,
      { category: 'food', amount: 1, currency: 'EGP' } as any, user,
    )).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateDayBudgetEntry(
      '64b000000000000000000002', 1, entryId, { amount: 2 } as any, user,
    )).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteDayBudgetEntry(
      '64b000000000000000000002', 1, entryId, user,
    )).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects bulk day replacement when day-linked budget entries exist without changing any day data', async () => {
    const originalEntry = { _id: new mongoose.Types.ObjectId(), category: 'food', amount: 18, currency: 'EGP' };
    const day = { order: 1, cityId: 'cairo', budgetEntries: [originalEntry], activities: [{ title: 'Keep' }] };
    const itinerary = makeItinerary([day]);
    mockOwnedItinerary(itinerary);

    const error = await service.updateDays(
      '64b000000000000000000002',
      { days: [{ order: 1, cityId: 'cairo' }] } as any,
      { sub: '64b000000000000000000001' } as any,
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getStatus()).toBe(409);
    expect(itinerary.save).not.toHaveBeenCalled();
    expect(itinerary.days[0]).toBe(day);
    expect(itinerary.days[0].budgetEntries[0]).toBe(originalEntry);
  });

  it('rejects bulk day replacement with transport entries before mutation and preserves all expense data', async () => {
    const transportEntry = { _id: new mongoose.Types.ObjectId(), mode: 'train', fromCityId: 'cairo', toCityId: 'alexandria', amount: 100, currency: 'EGP' };
    const dayBudgetEntries = [{ category: 'food', amount: 20, currency: 'EGP' }];
    const activityCost = { amount: 45, currency: 'EGP' };
    const day = {
      order: 1,
      cityId: 'cairo',
      transportEntries: [transportEntry],
      budgetEntries: dayBudgetEntries,
      activities: [{ title: 'Tour', cost: activityCost }],
      notes: 'Preserve me',
    };
    const legacyBudgetEntries = [{ category: 'food', amount: 15, currency: 'EGP' }];
    const itinerary = makeItinerary([day], { budgetEntries: legacyBudgetEntries });
    mockOwnedItinerary(itinerary);

    const error = await service.updateDays(
      '64b000000000000000000002',
      { days: [{ order: 1, cityId: 'alexandria' }] } as any,
      { sub: '64b000000000000000000001' } as any,
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getStatus()).toBe(409);
    expect(itinerary.save).not.toHaveBeenCalled();
    expect(itinerary.days[0]).toBe(day);
    expect(day.transportEntries[0]).toBe(transportEntry);
    expect(day.budgetEntries).toBe(dayBudgetEntries);
    expect(day.activities[0].cost).toBe(activityCost);
    expect(day.notes).toBe('Preserve me');
    expect(itinerary.budgetEntries).toBe(legacyBudgetEntries);
  });

  it('validates budget DTO categories, amounts, currency format, nulls, and optional patch fields', async () => {
    const valid = plainToInstance(CreateDayBudgetEntryDto, { category: 'activities', amount: 0, currency: ' egp ' });
    expect(await validate(valid)).toEqual([]);
    expect(valid.currency).toBe('EGP');

    for (const payload of [
      { category: 'transport', amount: 1, currency: 'EGP' },
      { category: 'food', amount: -1, currency: 'EGP' },
      { category: 'food', amount: 1, currency: 'US' },
      { category: 'food', amount: 1, currency: 'EGP', description: null },
      { category: null, amount: 1, currency: 'EGP' },
      { category: 'food', amount: null, currency: 'EGP' },
      { category: 'food', amount: 1, currency: null },
    ]) {
      expect(await validate(plainToInstance(CreateDayBudgetEntryDto, payload))).not.toEqual([]);
    }

    expect(await validate(plainToInstance(UpdateDayBudgetEntryDto, { amount: 3 }))).toEqual([]);
    for (const payload of [{ amount: null }, { description: null }, { category: 'intercity_transportation' }, { amount: -1 }, { currency: 'US' }]) {
      expect(await validate(plainToInstance(UpdateDayBudgetEntryDto, payload))).not.toEqual([]);
    }
  });

  it('creates a transport entry with a generated ID and preserves existing expenses', async () => {
    const Model = mongoose.model('ItineraryTransportCreateFixture', ItinerarySchema);
    const itinerary = new Model({
      title: 'Transport fixture',
      userId: new mongoose.Types.ObjectId('64b000000000000000000001'),
      startDate: new Date('2026-01-30T00:00:00.000Z'),
      days: [{ order: 1, date: new Date('2026-01-30T00:00:00.000Z'), cityId: 'cairo', activities: [{ title: 'Tour', cost: { amount: 30, currency: 'EGP' } }] }],
      budgetEntries: [{ category: 'food', amount: 15, currency: 'EGP' }],
    });
    vi.spyOn(itinerary, 'save').mockResolvedValue(itinerary as any);
    mockOwnedItinerary(itinerary);

    const response = await service.createDayTransportEntry(
      String(itinerary._id), 1,
      { mode: ' train ', fromCityId: ' cairo ', toCityId: ' alexandria ', amount: 120, currency: ' egp ' } as any,
      { sub: '64b000000000000000000001' } as any,
    );

    const created = itinerary.days[0].transportEntries[0] as any;
    expect(mongoose.Types.ObjectId.isValid(String(created._id))).toBe(true);
    expect(created.toObject()).toMatchObject({ mode: 'train', fromCityId: 'cairo', toCityId: 'alexandria', amount: 120, currency: 'EGP' });
    expect(String(response.days[0].transportEntries[0]._id)).toBe(String(created._id));
    expect(reference.city).toHaveBeenCalledWith('cairo');
    expect(reference.city).toHaveBeenCalledWith('alexandria');
    expect(reference.isSupportedCurrency).toHaveBeenCalledWith('EGP');
    expect(itinerary.budgetEntries).toHaveLength(1);
    expect(itinerary.budgetEntries[0].amount).toBe(15);
    expect(itinerary.days[0].activities[0].cost).toMatchObject({ amount: 30, currency: 'EGP' });
  });

  it('rejects invalid transport creation values and unknown references', async () => {
    const itinerary = makeItinerary([{ order: 1, transportEntries: [] }]);
    mockOwnedItinerary(itinerary);
    const user = { sub: '64b000000000000000000001' } as any;
    const base = { mode: 'train', fromCityId: 'cairo', toCityId: 'alexandria', amount: 10, currency: 'EGP' };

    await expect(service.createDayTransportEntry('64b000000000000000000002', 0, base as any, user))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createDayTransportEntry('64b000000000000000000002', 2, base as any, user))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(service.createDayTransportEntry('64b000000000000000000002', 1, { ...base, mode: '  ' } as any, user))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createDayTransportEntry('64b000000000000000000002', 1, { ...base, amount: -1 } as any, user))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createDayTransportEntry('64b000000000000000000002', 1, { ...base, toCityId: 'cairo' } as any, user))
      .rejects.toBeInstanceOf(BadRequestException);

    reference.city.mockRejectedValueOnce(new NotFoundException('Unknown city'));
    await expect(service.createDayTransportEntry('64b000000000000000000002', 1, base as any, user))
      .rejects.toBeInstanceOf(NotFoundException);
    reference.isSupportedCurrency.mockResolvedValueOnce(false);
    await expect(service.createDayTransportEntry('64b000000000000000000002', 1, { ...base, currency: 'ZZZ' } as any, user))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects PATCH when changing either city alone makes the merged pair identical', async () => {
    const entryId = new mongoose.Types.ObjectId();
    const entry = { _id: entryId, mode: 'train', fromCityId: 'cairo', toCityId: 'alexandria', amount: 100, currency: 'EGP' };
    const day = { order: 1, transportEntries: [entry] };
    const itinerary = makeItinerary([day]);
    mockOwnedItinerary(itinerary);

    await expect(service.updateDayTransportEntry(
      '64b000000000000000000002', 1, entryId.toString(), { fromCityId: 'alexandria' } as any,
      { sub: '64b000000000000000000001' } as any,
    )).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateDayTransportEntry(
      '64b000000000000000000002', 1, entryId.toString(), { toCityId: 'cairo' } as any,
      { sub: '64b000000000000000000001' } as any,
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(entry).toMatchObject({ fromCityId: 'cairo', toCityId: 'alexandria' });
    expect(itinerary.save).not.toHaveBeenCalled();
  });

  it('applies valid partial city and currency updates only after merged validation', async () => {
    const entryId = new mongoose.Types.ObjectId();
    const entry = { _id: entryId, mode: 'train', fromCityId: 'cairo', toCityId: 'alexandria', amount: 100, currency: 'EGP', retained: true };
    const day = { order: 1, transportEntries: [entry], budgetEntries: [{ category: 'food', amount: 20, currency: 'EGP' }], activities: [{ title: 'Tour', cost: { amount: 45, currency: 'EGP' } }] };
    const legacyEntries = [{ category: 'food', amount: 15, currency: 'EGP' }];
    const itinerary = makeItinerary([day], { budgetEntries: legacyEntries });
    mockOwnedItinerary(itinerary);

    await service.updateDayTransportEntry(
      '64b000000000000000000002', 1, entryId.toString(), { fromCityId: 'giza' } as any,
      { sub: '64b000000000000000000001' } as any,
    );
    expect(entry).toMatchObject({ fromCityId: 'giza', toCityId: 'alexandria', mode: 'train', amount: 100, currency: 'EGP', retained: true });
    expect(reference.city).toHaveBeenCalledWith('giza');
    expect(reference.city).toHaveBeenCalledWith('alexandria');

    await service.updateDayTransportEntry(
      '64b000000000000000000002', 1, entryId.toString(), { currency: ' usd ' } as any,
      { sub: '64b000000000000000000001' } as any,
    );
    expect(entry.currency).toBe('USD');
    expect(reference.isSupportedCurrency).toHaveBeenLastCalledWith('USD');
    expect(day.budgetEntries[0].amount).toBe(20);
    expect(day.activities[0].cost).toEqual({ amount: 45, currency: 'EGP' });
    expect(itinerary.budgetEntries).toBe(legacyEntries);
    expect(itinerary.save).toHaveBeenCalledTimes(2);
  });

  it('rejects transport PATCH with unsupported currency, unknown merged city, empty patch, or invalid merged fields without mutation', async () => {
    const entryId = new mongoose.Types.ObjectId();
    const entry = { _id: entryId, mode: 'train', fromCityId: 'cairo', toCityId: 'alexandria', amount: 100, currency: 'EGP' };
    const day = { order: 1, transportEntries: [entry] };
    const itinerary = makeItinerary([day]);
    mockOwnedItinerary(itinerary);
    const user = { sub: '64b000000000000000000001' } as any;
    const original = { ...entry };

    await expect(service.updateDayTransportEntry('64b000000000000000000002', 1, entryId.toString(), {} as any, user))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateDayTransportEntry('64b000000000000000000002', 1, entryId.toString(), { mode: null } as any, user))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateDayTransportEntry('64b000000000000000000002', 1, entryId.toString(), { amount: -1 } as any, user))
      .rejects.toBeInstanceOf(BadRequestException);

    reference.isSupportedCurrency.mockResolvedValueOnce(false);
    await expect(service.updateDayTransportEntry('64b000000000000000000002', 1, entryId.toString(), { currency: 'USD' } as any, user))
      .rejects.toBeInstanceOf(BadRequestException);
    reference.city.mockRejectedValueOnce(new NotFoundException('Unknown city'));
    await expect(service.updateDayTransportEntry('64b000000000000000000002', 1, entryId.toString(), { toCityId: 'unknown' } as any, user))
      .rejects.toBeInstanceOf(NotFoundException);

    expect(entry).toEqual(original);
    expect(itinerary.save).not.toHaveBeenCalled();
  });

  it('deletes only the selected transport subdocument and preserves other expenses', async () => {
    const deleteId = new mongoose.Types.ObjectId();
    const retainedId = new mongoose.Types.ObjectId();
    const remove = { _id: deleteId, mode: 'train', fromCityId: 'cairo', toCityId: 'alexandria', amount: 100, currency: 'EGP' };
    const retained = { _id: retainedId, mode: 'bus', fromCityId: 'giza', toCityId: 'cairo', amount: 50, currency: 'EGP' };
    const budgetEntries = [{ category: 'food', amount: 20, currency: 'EGP' }];
    const activityCost = { amount: 45, currency: 'EGP' };
    const day = { order: 1, transportEntries: [remove, retained], budgetEntries, activities: [{ title: 'Tour', cost: activityCost }] };
    const legacyEntries = [{ category: 'food', amount: 15, currency: 'EGP' }];
    const itinerary = makeItinerary([day], { budgetEntries: legacyEntries });
    mockOwnedItinerary(itinerary);

    const response = await service.deleteDayTransportEntry(
      '64b000000000000000000002', 1, deleteId.toString(),
      { sub: '64b000000000000000000001' } as any,
    );

    expect(day.transportEntries).toEqual([retained]);
    expect(response.days[0].transportEntries).toHaveLength(1);
    expect(String(response.days[0].transportEntries[0]._id)).toBe(retainedId.toString());
    expect(day.budgetEntries).toBe(budgetEntries);
    expect(day.activities[0].cost).toBe(activityCost);
    expect(itinerary.budgetEntries).toBe(legacyEntries);
  });

  it('scopes transport entries to the selected day and returns 404 for missing resources', async () => {
    const firstId = new mongoose.Types.ObjectId();
    const secondId = new mongoose.Types.ObjectId();
    const firstEntry = { _id: firstId, mode: 'train', fromCityId: 'cairo', toCityId: 'alexandria', amount: 100, currency: 'EGP' };
    const secondEntry = { _id: secondId, mode: 'bus', fromCityId: 'giza', toCityId: 'cairo', amount: 50, currency: 'EGP' };
    const firstDay = { order: 1, transportEntries: [firstEntry] };
    const secondDay = { order: 2, transportEntries: [secondEntry] };
    const itinerary = makeItinerary([firstDay, secondDay]);
    mockOwnedItinerary(itinerary);
    const user = { sub: '64b000000000000000000001' } as any;

    await expect(service.updateDayTransportEntry('64b000000000000000000002', 1, secondId.toString(), { amount: 55 } as any, user))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteDayTransportEntry('64b000000000000000000002', 1, secondId.toString(), user))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateDayTransportEntry('64b000000000000000000002', 3, firstId.toString(), { amount: 55 } as any, user))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteDayTransportEntry('64b000000000000000000002', 3, firstId.toString(), user))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteDayTransportEntry('64b000000000000000000002', 1, new mongoose.Types.ObjectId().toString(), user))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(firstEntry.amount).toBe(100);
    expect(secondEntry.amount).toBe(50);
    expect(itinerary.save).not.toHaveBeenCalled();
  });

  it('checks transport CRUD ownership, itinerary IDs, entry IDs, and positive dayOrder', async () => {
    const user = { sub: '64b000000000000000000001' } as any;
    const entryId = new mongoose.Types.ObjectId().toString();
    const base = { mode: 'train', fromCityId: 'cairo', toCityId: 'alexandria', amount: 10, currency: 'EGP' };
    const model = (service as any).itineraryModel;
    model.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
    await expect(service.createDayTransportEntry('bad-id', 1, base as any, user))
      .rejects.toBeInstanceOf(BadRequestException);

    await expect(service.createDayTransportEntry('64b000000000000000000002', 0, base as any, user))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateDayTransportEntry('64b000000000000000000002', 1, 'bad-id', { amount: 20 } as any, user))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.deleteDayTransportEntry('64b000000000000000000002', 0, entryId, user))
      .rejects.toBeInstanceOf(BadRequestException);

    model.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ userId: '64b000000000000000000009' }) });
    await expect(service.createDayTransportEntry('64b000000000000000000002', 1, base as any, user))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateDayTransportEntry('64b000000000000000000002', 1, entryId, { amount: 20 } as any, user))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.deleteDayTransportEntry('64b000000000000000000002', 1, entryId, user))
      .rejects.toBeInstanceOf(ForbiddenException);

    model.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
    await expect(service.createDayTransportEntry('64b000000000000000000002', 1, base as any, user))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateDayTransportEntry('64b000000000000000000002', 1, entryId, { amount: 20 } as any, user))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteDayTransportEntry('64b000000000000000000002', 1, entryId, user))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('validates transport DTO mode, amount, city pair, currency format, and null fields', async () => {
    const valid = plainToInstance(CreateIntercityTransportEntryDto, {
      mode: ' train ', fromCityId: ' cairo ', toCityId: ' alexandria ', amount: 0, currency: ' egp ',
    });
    expect(await validate(valid)).toEqual([]);
    expect(valid.mode).toBe('train');
    expect(valid.fromCityId).toBe('cairo');
    expect(valid.currency).toBe('EGP');

    for (const payload of [
      { mode: ' ', fromCityId: 'cairo', toCityId: 'alexandria', amount: 1, currency: 'EGP' },
      { mode: 'train', fromCityId: 'cairo', toCityId: 'cairo', amount: 1, currency: 'EGP' },
      { mode: 'train', fromCityId: 'cairo', toCityId: 'alexandria', amount: -1, currency: 'EGP' },
      { mode: 'train', fromCityId: 'cairo', toCityId: 'alexandria', amount: 1, currency: 'US' },
      { mode: null, fromCityId: 'cairo', toCityId: 'alexandria', amount: 1, currency: 'EGP' },
      { mode: 'train', fromCityId: null, toCityId: 'alexandria', amount: 1, currency: 'EGP' },
      { mode: 'train', fromCityId: 'cairo', toCityId: null, amount: 1, currency: 'EGP' },
      { mode: 'train', fromCityId: 'cairo', toCityId: 'alexandria', amount: null, currency: 'EGP' },
      { mode: 'train', fromCityId: 'cairo', toCityId: 'alexandria', amount: 1, currency: null },
    ]) {
      expect(await validate(plainToInstance(CreateIntercityTransportEntryDto, payload))).not.toEqual([]);
    }

    expect(await validate(plainToInstance(UpdateIntercityTransportEntryDto, { mode: ' bus ' }))).toEqual([]);
    for (const payload of [{ mode: null }, { amount: null }, { fromCityId: null }, { toCityId: null }, { currency: null }, { mode: '  ' }, { amount: -1 }, { currency: 'US' }]) {
      expect(await validate(plainToInstance(UpdateIntercityTransportEntryDto, payload))).not.toEqual([]);
    }
  });

  it('returns fixed empty category totals and includes empty itinerary days', () => {
    const emptyItinerary = makeItinerary([], { budgetEntries: [] });
    const empty = (service as any).calculateBudgetSummary(emptyItinerary);
    expect(empty.totalsByCurrency).toEqual([]);
    expect(empty.categoryTotals.map((item: any) => item.category)).toEqual([
      'food', 'accommodation', 'local_transportation', 'activities', 'intercity_transportation',
    ]);
    expect(empty.categoryTotals.every((item: any) => item.totalsByCurrency.length === 0)).toBe(true);
    expect(empty.dayTotals).toEqual([]);
    expect(empty.unassignedLegacyByCurrency).toEqual([]);

    const noExpenses = makeItinerary([
      { order: 1, date: new Date('2026-04-10T00:00:00.000Z'), cityId: 'cairo' },
    ], { budgetEntries: [] });
    const summary = (service as any).calculateBudgetSummary(noExpenses);
    expect(summary.dayTotals).toHaveLength(1);
    expect(summary.dayTotals[0]).toMatchObject({
      dayOrder: 1, date: '2026-04-10', cityId: 'cairo', totalsByCurrency: [],
    });
    expect(summary.dayTotals[0].categoryTotals).toHaveLength(5);
    expect(summary.dayTotals[0].categoryTotals.every((item: any) => item.totalsByCurrency.length === 0)).toBe(true);
  });

  it('aggregates each source by currency, category, and day without combining currencies', () => {
    const dayOne = {
      order: 1,
      date: new Date('2026-04-10T00:00:00.000Z'),
      cityId: 'cairo',
      budgetEntries: [
        { category: 'food', amount: 10, currency: 'EGP' },
        { category: 'food', amount: 2, currency: 'EGP' },
        { category: 'local_transportation', amount: 4, currency: 'EGP' },
        { category: 'activities', amount: 5, currency: 'EGP' },
      ],
      activities: [
        { title: 'Museum', cost: { amount: 20, currency: 'EGP' } },
        { title: 'Show', cost: { amount: 7, currency: 'USD' } },
      ],
      transportEntries: [
        { mode: 'train', fromCityId: 'cairo', toCityId: 'alexandria', amount: 100, currency: 'EGP' },
      ],
    };
    const dayTwo = {
      order: 2,
      date: new Date('2026-04-11T00:00:00.000Z'),
      cityId: 'alexandria',
      budgetEntries: [
        { category: 'food', amount: 3, currency: 'USD' },
        { category: 'activities', amount: 2, currency: 'USD' },
      ],
      activities: [{ title: 'Gallery', cost: { amount: 5, currency: 'USD' } }],
      transportEntries: [
        { mode: 'bus', fromCityId: 'alexandria', toCityId: 'cairo', amount: 30, currency: 'USD' },
      ],
    };
    const itinerary = makeItinerary([dayTwo, dayOne], {
      budgetEntries: [
        { category: 'food', amount: 3, currency: 'EGP', date: new Date('2026-04-10T19:00:00.000Z') },
        { category: 'food', amount: 6, currency: 'EGP', date: new Date('2026-04-12T00:00:00.000Z') },
        { category: 'intercity_transportation', amount: 11, currency: 'USD' },
      ],
    });

    const summary = (service as any).calculateBudgetSummary(itinerary);

    expect(summary.totalsByCurrency).toEqual([
      { currency: 'EGP', amount: 150 },
      { currency: 'USD', amount: 58 },
    ]);
    expect(summary.categoryTotals.map((item: any) => item.category)).toEqual([
      'food', 'accommodation', 'local_transportation', 'activities', 'intercity_transportation',
    ]);
    expect(summary.categoryTotals).toEqual([
      { category: 'food', totalsByCurrency: [{ currency: 'EGP', amount: 21 }, { currency: 'USD', amount: 3 }] },
      { category: 'accommodation', totalsByCurrency: [] },
      { category: 'local_transportation', totalsByCurrency: [{ currency: 'EGP', amount: 4 }] },
      { category: 'activities', totalsByCurrency: [{ currency: 'EGP', amount: 25 }, { currency: 'USD', amount: 14 }] },
      { category: 'intercity_transportation', totalsByCurrency: [{ currency: 'EGP', amount: 100 }, { currency: 'USD', amount: 41 }] },
    ]);
    expect(summary.dayTotals.map((day: any) => day.dayOrder)).toEqual([1, 2]);
    expect(summary.dayTotals[0]).toMatchObject({
      date: '2026-04-10',
      totalsByCurrency: [{ currency: 'EGP', amount: 144 }, { currency: 'USD', amount: 7 }],
    });
    expect(summary.dayTotals[0].categoryTotals.find((item: any) => item.category === 'activities').totalsByCurrency)
      .toEqual([{ currency: 'EGP', amount: 25 }, { currency: 'USD', amount: 7 }]);
    expect(summary.dayTotals[1]).toMatchObject({
      date: '2026-04-11',
      totalsByCurrency: [{ currency: 'USD', amount: 40 }],
    });
    // This UTC date match is explicit; the unmatched legacy entry is not attached to a day by position.
    expect(summary.unassignedLegacyByCurrency).toEqual([
      {
        currency: 'EGP', amount: 6,
        entries: [{ category: 'food', amount: 6, currency: 'EGP', date: '2026-04-12' }],
      },
      {
        currency: 'USD', amount: 11,
        entries: [{ category: 'intercity_transportation', amount: 11, currency: 'USD' }],
      },
    ]);
  });

  it('matches legacy entries by unique UTC date and leaves unmatched entries unassigned without mutating the itinerary', async () => {
    const itinerary = makeItinerary([
      { order: 1, date: new Date('2026-04-10T00:00:00.000Z'), cityId: 'cairo', budgetEntries: [] },
      { order: 2, date: new Date('2026-04-11T00:00:00.000Z'), cityId: 'alexandria', budgetEntries: [] },
    ], {
      budgetEntries: [
        { category: 'accommodation', amount: 50, currency: 'EGP', date: new Date('2026-04-10T23:00:00.000-04:00'), description: 'Stay' },
        { category: 'food', amount: 12, currency: 'EGP', date: new Date('2026-04-12T00:00:00.000Z') },
        { category: 'food', amount: 8, currency: 'USD' },
      ],
    });
    const originalSnapshot = JSON.stringify({ days: itinerary.days, budgetEntries: itinerary.budgetEntries });
    mockOwnedItinerary(itinerary);

    const summary = await service.getBudgetSummary(
      '64b000000000000000000002',
      { sub: '64b000000000000000000001' } as any,
    );

    expect(summary.dayTotals[0].date).toBe('2026-04-10');
    expect(summary.dayTotals[0].totalsByCurrency).toEqual([]);
    // The legacy timestamp's UTC date is April 11, even though its local offset is April 10.
    expect(summary.dayTotals[1].totalsByCurrency).toEqual([{ currency: 'EGP', amount: 50 }]);
    expect(summary.totalsByCurrency).toEqual([
      { currency: 'EGP', amount: 62 },
      { currency: 'USD', amount: 8 },
    ]);
    expect(summary.categoryTotals.find((item: any) => item.category === 'accommodation').totalsByCurrency)
      .toEqual([{ currency: 'EGP', amount: 50 }]);
    expect(summary.unassignedLegacyByCurrency.map((bucket: any) => bucket.amount)).toEqual([12, 8]);
    expect(JSON.stringify({ days: itinerary.days, budgetEntries: itinerary.budgetEntries })).toBe(originalSnapshot);
    expect(itinerary).not.toHaveProperty('totalsByCurrency');
    expect(itinerary.save).not.toHaveBeenCalled();
  });

  it('groups consecutive canonical cities and calculates subtotals by currency from every assigned expense source', () => {
    const itinerary = makeItinerary([
      {
        order: 1, date: new Date('2026-04-10T00:00:00.000Z'), cityId: 'cairo',
        budgetEntries: [{ category: 'food', amount: 10, currency: 'EGP' }],
        activities: [{ title: 'Museum', cost: { amount: 2, currency: 'USD' } }],
        transportEntries: [{ amount: 3, currency: 'EGP' }],
      },
      {
        order: 2, date: new Date('2026-04-11T00:00:00.000Z'), cityId: 'cairo',
        budgetEntries: [{ category: 'food', amount: 4, currency: 'USD' }],
        activities: [{ title: 'Show', cost: { amount: 5, currency: 'EGP' } }],
      },
      { order: 3, date: new Date('2026-04-12T00:00:00.000Z'), cityId: 'alexandria' },
      {
        order: 4, date: new Date('2026-04-13T00:00:00.000Z'), cityId: 'cairo',
        budgetEntries: [{ category: 'food', amount: 1, currency: 'EGP' }],
      },
    ], {
      budgetEntries: [
        { category: 'accommodation', amount: 8, currency: 'USD', date: new Date('2026-04-10T12:00:00.000Z') },
        { category: 'food', amount: 7, currency: 'EGP', date: new Date('2026-04-20T00:00:00.000Z') },
      ],
    });
    const before = JSON.stringify({ days: itinerary.days, budgetEntries: itinerary.budgetEntries });

    const summary = (service as any).calculateBudgetSummary(itinerary);

    expect(summary.cityGroups).toEqual([
      {
        cityId: 'cairo', startDayOrder: 1, endDayOrder: 2, dayCount: 2,
        totalsByCurrency: [{ currency: 'EGP', amount: 18 }, { currency: 'USD', amount: 14 }],
      },
      { cityId: 'alexandria', startDayOrder: 3, endDayOrder: 3, dayCount: 1, totalsByCurrency: [] },
      {
        cityId: 'cairo', startDayOrder: 4, endDayOrder: 4, dayCount: 1,
        totalsByCurrency: [{ currency: 'EGP', amount: 1 }],
      },
    ]);
    // Activity cost is included once in the group and once in the overall total.
    expect(summary.categoryTotals.find((item: any) => item.category === 'activities').totalsByCurrency)
      .toEqual([{ currency: 'EGP', amount: 5 }, { currency: 'USD', amount: 2 }]);
    expect(summary.dayTotals[0].categoryTotals.find((item: any) => item.category === 'intercity_transportation').totalsByCurrency)
      .toEqual([{ currency: 'EGP', amount: 3 }]);
    expect(summary.unassignedLegacyByCurrency).toEqual([
      { currency: 'EGP', amount: 7, entries: [{ category: 'food', amount: 7, currency: 'EGP', date: '2026-04-20' }] },
    ]);
    const reconciled = new Map<string, number>();
    for (const group of summary.cityGroups) {
      for (const item of group.totalsByCurrency) reconciled.set(item.currency, (reconciled.get(item.currency) ?? 0) + item.amount);
    }
    for (const bucket of summary.unassignedLegacyByCurrency) {
      reconciled.set(bucket.currency, (reconciled.get(bucket.currency) ?? 0) + bucket.amount);
    }
    expect([...reconciled.entries()].sort()).toEqual(summary.totalsByCurrency.map((item: any) => [item.currency, item.amount]));
    expect(JSON.stringify({ days: itinerary.days, budgetEntries: itinerary.budgetEntries })).toBe(before);
    expect(itinerary.save).not.toHaveBeenCalled();
  });

  it('keeps days without canonical city IDs in separate standalone groups', () => {
    const summary = (service as any).calculateBudgetSummary(makeItinerary([
      { order: 1, date: new Date('2026-04-10T00:00:00.000Z'), cityId: null, budgetEntries: [{ category: 'food', amount: 1, currency: 'EGP' }] },
      { order: 2, date: new Date('2026-04-11T00:00:00.000Z'), cityId: '', budgetEntries: [{ category: 'food', amount: 2, currency: 'EGP' }] },
      { order: 3, date: new Date('2026-04-12T00:00:00.000Z'), cityId: 'cairo' },
    ], { budgetEntries: [] }));

    expect(summary.cityGroups).toEqual([
      { cityId: null, startDayOrder: 1, endDayOrder: 1, dayCount: 1, totalsByCurrency: [{ currency: 'EGP', amount: 1 }] },
      { cityId: null, startDayOrder: 2, endDayOrder: 2, dayCount: 1, totalsByCurrency: [{ currency: 'EGP', amount: 2 }] },
      { cityId: 'cairo', startDayOrder: 3, endDayOrder: 3, dayCount: 1, totalsByCurrency: [] },
    ]);
  });

  it('leaves ambiguous legacy date matches unassigned instead of adding them to a group', () => {
    const summary = (service as any).calculateBudgetSummary(makeItinerary([
      { order: 1, date: new Date('2026-04-10T00:00:00.000Z'), cityId: 'cairo' },
      { order: 2, date: new Date('2026-04-10T00:00:00.000Z'), cityId: 'cairo' },
    ], {
      budgetEntries: [{ category: 'food', amount: 9, currency: 'EGP', date: new Date('2026-04-10T13:00:00.000Z') }],
    }));

    expect(summary.cityGroups).toEqual([
      { cityId: 'cairo', startDayOrder: 1, endDayOrder: 2, dayCount: 2, totalsByCurrency: [] },
    ]);
    expect(summary.unassignedLegacyByCurrency).toEqual([
      { currency: 'EGP', amount: 9, entries: [{ category: 'food', amount: 9, currency: 'EGP', date: '2026-04-10' }] },
    ]);
    expect(summary.totalsByCurrency).toEqual([{ currency: 'EGP', amount: 9 }]);
  });

  it('reflects day deletion and movement in the next computed budget summary', async () => {
    const first = { order: 1, date: new Date('2026-01-30T00:00:00.000Z'), cityId: 'cairo', budgetEntries: [{ category: 'food', amount: 10, currency: 'EGP' }] };
    const second = { order: 2, date: new Date('2026-01-31T00:00:00.000Z'), cityId: 'alexandria', budgetEntries: [{ category: 'food', amount: 20, currency: 'EGP' }] };
    const itinerary = makeItinerary([first, second], { budgetEntries: [] });
    mockOwnedItinerary(itinerary);

    await service.deleteDay(
      '64b000000000000000000002', 1, { confirmed: true },
      { sub: '64b000000000000000000001' } as any,
    );
    const afterDelete = await service.getBudgetSummary(
      '64b000000000000000000002', { sub: '64b000000000000000000001' } as any,
    );
    expect(afterDelete.totalsByCurrency).toEqual([{ currency: 'EGP', amount: 20 }]);
    expect(afterDelete.dayTotals).toHaveLength(1);
    expect(afterDelete.dayTotals[0]).toMatchObject({ dayOrder: 1, date: '2026-01-30' });
    expect(afterDelete.cityGroups).toEqual([
      { cityId: 'alexandria', startDayOrder: 1, endDayOrder: 1, dayCount: 1, totalsByCurrency: [{ currency: 'EGP', amount: 20 }] },
    ]);

    const moveFirst = { order: 1, date: new Date('2026-01-30T00:00:00.000Z'), cityId: 'cairo', budgetEntries: [{ category: 'food', amount: 10, currency: 'EGP' }] };
    const moveSecond = { order: 2, date: new Date('2026-01-31T00:00:00.000Z'), cityId: 'alexandria', budgetEntries: [{ category: 'food', amount: 20, currency: 'EGP' }] };
    const moveItinerary = makeItinerary([moveFirst, moveSecond], { budgetEntries: [] });
    (service as any).getOwnedItinerary.mockResolvedValue(moveItinerary);
    await service.moveDay(
      '64b000000000000000000002', 1, { newDayOrder: 2 },
      { sub: '64b000000000000000000001' } as any,
    );
    const afterMove = await service.getBudgetSummary(
      '64b000000000000000000002', { sub: '64b000000000000000000001' } as any,
    );
    expect(afterMove.totalsByCurrency).toEqual([{ currency: 'EGP', amount: 30 }]);
    expect(afterMove.dayTotals.map((day: any) => day.totalsByCurrency)).toEqual([
      [{ currency: 'EGP', amount: 20 }],
      [{ currency: 'EGP', amount: 10 }],
    ]);
    expect(afterMove.cityGroups).toEqual([
      { cityId: 'alexandria', startDayOrder: 1, endDayOrder: 1, dayCount: 1, totalsByCurrency: [{ currency: 'EGP', amount: 20 }] },
      { cityId: 'cairo', startDayOrder: 2, endDayOrder: 2, dayCount: 1, totalsByCurrency: [{ currency: 'EGP', amount: 10 }] },
    ]);
  });

  it('recalculates city group boundaries after moving and deleting days', async () => {
    const user = { sub: '64b000000000000000000001' } as any;
    const days = [
      { order: 1, date: new Date('2026-01-30T00:00:00.000Z'), cityId: 'cairo' },
      { order: 2, date: new Date('2026-01-31T00:00:00.000Z'), cityId: 'alexandria' },
      { order: 3, date: new Date('2026-02-01T00:00:00.000Z'), cityId: 'cairo' },
    ];
    const itinerary = makeItinerary(days, { budgetEntries: [] });
    mockOwnedItinerary(itinerary);

    await service.moveDay('64b000000000000000000002', 3, { newDayOrder: 1 }, user);
    let summary = await service.getBudgetSummary('64b000000000000000000002', user);
    expect(summary.cityGroups.map((group: any) => [group.cityId, group.startDayOrder, group.endDayOrder, group.dayCount]))
      .toEqual([['cairo', 1, 2, 2], ['alexandria', 3, 3, 1]]);

    (service as any).getOwnedItinerary.mockResolvedValue(itinerary);
    await service.deleteDay('64b000000000000000000002', 3, { confirmed: true }, user);
    summary = await service.getBudgetSummary('64b000000000000000000002', user);
    expect(summary.cityGroups.map((group: any) => [group.cityId, group.startDayOrder, group.endDayOrder, group.dayCount]))
      .toEqual([['cairo', 1, 2, 2]]);
  });

  it('converts overall, category, day, and city-group totals from the current supported preference', async () => {
    const itinerary = makeItinerary([
      {
        order: 1,
        date: new Date('2026-04-10T00:00:00.000Z'),
        cityId: 'cairo',
        budgetEntries: [{ category: 'food', amount: 100, currency: 'EGP' }],
        activities: [{ title: 'Tour', cost: { amount: 10, currency: 'USD' } }],
        transportEntries: [{ amount: 20, currency: 'EUR' }],
      },
      {
        order: 2,
        date: new Date('2026-04-11T00:00:00.000Z'),
        cityId: 'cairo',
        budgetEntries: [{ category: 'accommodation', amount: 50, currency: 'EGP' }],
      },
    ], {
      budgetEntries: [
        { category: 'food', amount: 25, currency: 'EGP', date: new Date('2026-04-10T12:00:00.000Z') },
        { category: 'food', amount: 30, currency: 'EUR', date: new Date('2026-04-20T12:00:00.000Z') },
        { category: 'activities', amount: 10, currency: 'USD' },
      ],
    });
    const original = JSON.stringify({ days: itinerary.days, budgetEntries: itinerary.budgetEntries });
    const user = { sub: '64b000000000000000000001' } as any;
    mockOwnedItinerary(itinerary);
    usersService.findById.mockResolvedValue({ preferences: { currency: 'USD' } });
    fxService.getLatestCachedSnapshot.mockResolvedValue({
      provider: 'FXRatesAPI',
      baseCurrency: 'USD',
      rateDate: '2026-11-13',
      fetchedAt: new Date('2026-11-13T02:00:15.000Z'),
      rates: { USD: 1, EGP: 50, EUR: 0.8 },
    });
    const raw = (service as any).calculateBudgetSummary(itinerary);

    const result = await service.getBudgetSummary('64b000000000000000000002', user);

    expect(usersService.findById).toHaveBeenCalledWith(user.sub);
    expect(reference.isSupportedCurrency).toHaveBeenCalledWith('USD');
    expect(fxService.getLatestCachedSnapshot).toHaveBeenCalledOnce();
    expect(fxService.refreshSnapshotOrFallback).not.toHaveBeenCalled();
    expect(result.conversion).toEqual({
      status: 'available',
      targetCurrency: 'USD',
      rateDate: '2026-11-13',
      fetchedAt: new Date('2026-11-13T02:00:15.000Z'),
      rateSource: 'cached',
      total: { currency: 'USD', amount: 86 },
      categoryTotals: [
        { category: 'food', amount: 40 },
        { category: 'accommodation', amount: 1 },
        { category: 'local_transportation', amount: 0 },
        { category: 'activities', amount: 20 },
        { category: 'intercity_transportation', amount: 25 },
      ],
      dayTotals: [
        { dayOrder: 1, date: '2026-04-10', amount: 37.5 },
        { dayOrder: 2, date: '2026-04-11', amount: 1 },
      ],
      cityGroupTotals: [
        { cityId: 'cairo', startDayOrder: 1, endDayOrder: 2, dayCount: 2, amount: 38.5 },
      ],
    });
    expect(result.totalsByCurrency).toEqual(raw.totalsByCurrency);
    expect(result.categoryTotals).toEqual(raw.categoryTotals);
    expect(result.dayTotals).toEqual(raw.dayTotals);
    expect(result.cityGroups).toEqual(raw.cityGroups);
    expect(result.unassignedLegacyByCurrency).toEqual(raw.unassignedLegacyByCurrency);
    expect(JSON.stringify({ days: itinerary.days, budgetEntries: itinerary.budgetEntries })).toBe(original);
    expect(itinerary.save).not.toHaveBeenCalled();
  });

  it('reads the user currency preference on every summary request', async () => {
    const itinerary = makeItinerary([], {
      budgetEntries: [{ category: 'food', amount: 10, currency: 'EGP' }],
    });
    mockOwnedItinerary(itinerary);
    usersService.findById
      .mockResolvedValueOnce({ preferences: { currency: 'USD' } })
      .mockResolvedValueOnce({ preferences: { currency: 'EUR' } });
    fxService.getLatestCachedSnapshot.mockResolvedValue({
      provider: 'FXRatesAPI', baseCurrency: 'USD', rateDate: '2026-11-13',
      fetchedAt: new Date('2026-11-13T02:00:00Z'), rates: { USD: 1, EUR: 0.8, EGP: 50 },
    });
    const user = { sub: '64b000000000000000000001' } as any;

    const usdResult = await service.getBudgetSummary('64b000000000000000000002', user);
    const eurResult = await service.getBudgetSummary('64b000000000000000000002', user);

    expect(usersService.findById).toHaveBeenCalledTimes(2);
    expect(reference.isSupportedCurrency.mock.calls.map(([currency]) => currency)).toEqual([
      'USD', 'EGP', 'EUR', 'EGP',
    ]);
    expect(usdResult.conversion).toMatchObject({ status: 'available', targetCurrency: 'USD', total: { amount: 0.2 } });
    expect(eurResult.conversion).toMatchObject({ status: 'available', targetCurrency: 'EUR', total: { amount: 0.16 } });
    expect(fxService.refreshSnapshotOrFallback).not.toHaveBeenCalled();
  });

  it('returns unsupported or missing preference reasons without partial conversion', async () => {
    const itinerary = makeItinerary([], {
      budgetEntries: [{ category: 'food', amount: 10, currency: 'EGP' }],
    });
    const raw = (service as any).calculateBudgetSummary(itinerary);
    mockOwnedItinerary(itinerary);
    reference.isSupportedCurrency.mockResolvedValue(false);
    usersService.findById.mockResolvedValue({ preferences: { currency: 'ABC' } });

    const unsupported = await service.getBudgetSummary(
      '64b000000000000000000002', { sub: '64b000000000000000000001' } as any,
    );
    expect(unsupported.conversion).toEqual({
      status: 'unavailable', targetCurrency: 'ABC', reason: 'preferred_currency_unsupported',
    });
    expect(unsupported.totalsByCurrency).toEqual(raw.totalsByCurrency);
    expect(fxService.getLatestCachedSnapshot).not.toHaveBeenCalled();

    reference.isSupportedCurrency.mockResolvedValue(true);
    usersService.findById.mockResolvedValue({ preferences: {} });
    const missing = await service.getBudgetSummary(
      '64b000000000000000000002', { sub: '64b000000000000000000001' } as any,
    );
    expect(missing.conversion).toEqual({ status: 'unavailable', reason: 'preferred_currency_missing' });
    expect(missing.totalsByCurrency).toEqual(raw.totalsByCurrency);
    expect(fxService.getLatestCachedSnapshot).not.toHaveBeenCalled();
  });

  it('preserves raw totals when the cache is empty and propagates cache database failures', async () => {
    const itinerary = makeItinerary([], {
      budgetEntries: [{ category: 'food', amount: 10, currency: 'EGP' }],
    });
    const raw = (service as any).calculateBudgetSummary(itinerary);
    mockOwnedItinerary(itinerary);
    usersService.findById.mockResolvedValue({ preferences: { currency: 'USD' } });
    fxService.getLatestCachedSnapshot.mockResolvedValue(null);

    const noCache = await service.getBudgetSummary(
      '64b000000000000000000002', { sub: '64b000000000000000000001' } as any,
    );
    expect(noCache.conversion).toEqual({
      status: 'unavailable', targetCurrency: 'USD', reason: 'rates_unavailable',
    });
    expect(noCache.totalsByCurrency).toEqual(raw.totalsByCurrency);

    fxService.getLatestCachedSnapshot.mockRejectedValue(new FxCacheDatabaseError('read'));
    await expect(service.getBudgetSummary(
      '64b000000000000000000002', { sub: '64b000000000000000000001' } as any,
    )).rejects.toBeInstanceOf(FxCacheDatabaseError);
    expect(fxService.refreshSnapshotOrFallback).not.toHaveBeenCalled();
  });

  it('preserves all raw fields and returns no partial conversion when a required rate is missing', async () => {
    const itinerary = makeItinerary([
      { order: 1, date: new Date('2026-04-10T00:00:00.000Z'), cityId: 'cairo', budgetEntries: [{ category: 'food', amount: 10, currency: 'EGP' }] },
    ], { budgetEntries: [{ category: 'food', amount: 2, currency: 'USD' }] });
    const raw = (service as any).calculateBudgetSummary(itinerary);
    mockOwnedItinerary(itinerary);
    usersService.findById.mockResolvedValue({ preferences: { currency: 'USD' } });
    fxService.getLatestCachedSnapshot.mockResolvedValue({
      provider: 'FXRatesAPI', baseCurrency: 'USD', rateDate: '2026-11-13',
      fetchedAt: new Date('2026-11-13T02:00:00Z'), rates: { USD: 1 },
    });

    const missingSourceRate = await service.getBudgetSummary(
      '64b000000000000000000002', { sub: '64b000000000000000000001' } as any,
    );
    expect(missingSourceRate.conversion).toEqual({
      status: 'unavailable', targetCurrency: 'USD', reason: 'source_rate_missing',
    });
    expect(missingSourceRate.totalsByCurrency).toEqual(raw.totalsByCurrency);
    expect(missingSourceRate.categoryTotals).toEqual(raw.categoryTotals);
    expect(missingSourceRate.dayTotals).toEqual(raw.dayTotals);
    expect(missingSourceRate.cityGroups).toEqual(raw.cityGroups);
    expect(missingSourceRate.unassignedLegacyByCurrency).toEqual(raw.unassignedLegacyByCurrency);

    usersService.findById.mockResolvedValue({ preferences: { currency: 'EUR' } });
    reference.isSupportedCurrency.mockResolvedValue(true);
    fxService.getLatestCachedSnapshot.mockResolvedValue({
      provider: 'FXRatesAPI', baseCurrency: 'USD', rateDate: '2026-11-13',
      fetchedAt: new Date('2026-11-13T02:00:00Z'), rates: { USD: 1, EGP: 50 },
    });
    const missingTargetRate = await service.getBudgetSummary(
      '64b000000000000000000002', { sub: '64b000000000000000000001' } as any,
    );
    expect(missingTargetRate.conversion).toEqual({
      status: 'unavailable', targetCurrency: 'EUR', reason: 'target_rate_missing',
    });
    expect(missingTargetRate.totalsByCurrency).toEqual(raw.totalsByCurrency);
    expect(missingTargetRate.categoryTotals).toEqual(raw.categoryTotals);
    expect(missingTargetRate.dayTotals).toEqual(raw.dayTotals);
    expect(missingTargetRate.cityGroups).toEqual(raw.cityGroups);
    expect(missingTargetRate.unassignedLegacyByCurrency).toEqual(raw.unassignedLegacyByCurrency);
    expect(fxService.refreshSnapshotOrFallback).not.toHaveBeenCalled();
  });

  it('marks an unsupported stored expense currency unavailable without partial totals', async () => {
    const itinerary = makeItinerary([], {
      budgetEntries: [{ category: 'food', amount: 3, currency: 'XYZ' }],
    });
    const raw = (service as any).calculateBudgetSummary(itinerary);
    mockOwnedItinerary(itinerary);
    usersService.findById.mockResolvedValue({ preferences: { currency: 'USD' } });
    reference.isSupportedCurrency.mockImplementation(async (currency: string) => currency !== 'XYZ');
    fxService.getLatestCachedSnapshot.mockResolvedValue({
      provider: 'FXRatesAPI', baseCurrency: 'USD', rateDate: '2026-11-13',
      fetchedAt: new Date('2026-11-13T02:00:00Z'), rates: { USD: 1, XYZ: 2 },
    });

    const result = await service.getBudgetSummary(
      '64b000000000000000000002', { sub: '64b000000000000000000001' } as any,
    );

    expect(result.conversion).toEqual({
      status: 'unavailable', targetCurrency: 'USD', reason: 'source_currency_unsupported',
    });
    expect(result.totalsByCurrency).toEqual(raw.totalsByCurrency);
    expect(result.categoryTotals).toEqual(raw.categoryTotals);
    expect(result.dayTotals).toEqual(raw.dayTotals);
    expect(result.cityGroups).toEqual(raw.cityGroups);
    expect(result.unassignedLegacyByCurrency).toEqual(raw.unassignedLegacyByCurrency);
  });

  it('converts empty summaries to zero totals and excludes booking price fields', async () => {
    const itinerary = makeItinerary([], {
      budgetEntries: [],
      bookingPrice: { amount: 999, currency: 'USD' },
      flightPrice: { amount: 888, currency: 'EUR' },
    });
    mockOwnedItinerary(itinerary);
    usersService.findById.mockResolvedValue({ preferences: { currency: 'USD' } });
    fxService.getLatestCachedSnapshot.mockResolvedValue({
      provider: 'FXRatesAPI', baseCurrency: 'USD', rateDate: '2026-11-13',
      fetchedAt: new Date('2026-11-13T02:00:00Z'), rates: { USD: 1 },
    });

    const result = await service.getBudgetSummary(
      '64b000000000000000000002', { sub: '64b000000000000000000001' } as any,
    );

    expect(result.totalsByCurrency).toEqual([]);
    expect(result.conversion).toMatchObject({
      status: 'available', targetCurrency: 'USD', total: { amount: 0 },
      categoryTotals: [
        { category: 'food', amount: 0 },
        { category: 'accommodation', amount: 0 },
        { category: 'local_transportation', amount: 0 },
        { category: 'activities', amount: 0 },
        { category: 'intercity_transportation', amount: 0 },
      ],
      dayTotals: [], cityGroupTotals: [],
    });
  });

  it('returns the expected owner-scoped summary errors for invalid, missing, or non-owned itineraries', async () => {
    const model = (service as any).itineraryModel;
    const user = { sub: '64b000000000000000000001' } as any;
    model.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
    await expect(service.getBudgetSummary('invalid-id', user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.getBudgetSummary('64b000000000000000000002', user)).rejects.toBeInstanceOf(NotFoundException);
    model.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ userId: '64b000000000000000000009' }) });
    await expect(service.getBudgetSummary('64b000000000000000000002', user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('validates country codes through ReferenceService and normalizes their case', async () => {
    const result = await (service as any).validateCountries(['eg']);
    expect(result).toEqual(['EG']);
    expect(reference.country).toHaveBeenCalledWith('EG');
  });

  it('rejects country codes that are not present in ReferenceService', async () => {
    reference.country.mockRejectedValueOnce(new Error('Unknown country'));
    await expect((service as any).validateCountries(['ZZ'])).rejects.toThrow(
      'Unknown country',
    );
  });

  it('derives sequential day dates in UTC and validates canonical city IDs', async () => {
    const days = await (service as any).prepareDays(
      [
        { cityId: 'cairo', notes: 'Arrival' },
        { cityId: 'cairo', notes: 'Museum day' },
      ],
      new Date('2026-02-27T00:00:00.000Z'),
    );

    expect(days.map((day: any) => day.order)).toEqual([1, 2]);
    expect(days.map((day: any) => day.date.toISOString())).toEqual([
      '2026-02-27T00:00:00.000Z',
      '2026-02-28T00:00:00.000Z',
    ]);
    expect(days[1].notes).toBe('Museum day');
    expect(reference.city).toHaveBeenCalledWith('cairo');
  });

  it('normalizes legacy timestamp start dates to UTC calendar midnight', async () => {
    const days = await (service as any).prepareDays(
      [{ cityId: 'cairo' }],
      new Date('2026-02-27T15:45:00.000Z'),
    );
    expect(days[0].date.toISOString()).toBe('2026-02-27T00:00:00.000Z');
  });

  it('sorts requested day order then assigns contiguous order and derived dates', async () => {
    const days = await (service as any).prepareDays(
      [
        { order: 2, cityId: 'cairo' },
        { order: 1, cityId: 'cairo' },
      ],
      new Date('2026-02-27T00:00:00.000Z'),
      true,
    );
    expect(days.map((day: any) => day.order)).toEqual([1, 2]);
    expect(days[0].date.toISOString()).toBe('2026-02-27T00:00:00.000Z');
  });

  it('rejects more than 60 days', async () => {
    const days = Array.from({ length: 61 }, () => ({ cityId: 'cairo' }));
    await expect(
      (service as any).prepareDays(days, new Date('2026-01-01T00:00:00.000Z')),
    ).rejects.toThrow('An itinerary cannot exceed 60 days');
  });

  it('accepts exactly 60 days', async () => {
    const days = Array.from({ length: 60 }, () => ({ cityId: 'cairo' }));
    const prepared = await (service as any).prepareDays(
      days,
      new Date('2026-01-01T00:00:00.000Z'),
    );
    expect(prepared).toHaveLength(60);
    expect(prepared[59].order).toBe(60);
    expect(prepared[59].date.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('rejects city IDs that are not present in ReferenceService', async () => {
    reference.city.mockRejectedValueOnce(new Error('Unknown city'));
    await expect(
      (service as any).prepareDays(
        [{ cityId: 'unknown' }],
        new Date('2026-01-01T00:00:00.000Z'),
      ),
    ).rejects.toThrow('Unknown city');
  });

  it('validates and normalizes optional activity costs', async () => {
    const days = await (service as any).prepareDays(
      [{ cityId: 'cairo', activities: [{ title: 'Tour', cost: { amount: 0, currency: 'egp' } }] }],
      new Date('2026-01-01T00:00:00.000Z'),
    );
    expect(days[0].activities[0].cost).toEqual({ amount: 0, currency: 'EGP' });
    expect(reference.isSupportedCurrency).toHaveBeenCalledWith('EGP');
  });

  it('uses a strict date-only calendar date parser', () => {
    expect((service as any).parseDateOnly('2026-02-28').toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
    expect(() => (service as any).parseDateOnly('2026-02-30')).toThrow(
      'startDate is not a valid calendar date',
    );
  });

  it('accepts the new create contract without endDate or description', async () => {
    const dto = plainToInstance(CreateItineraryDto, {
      title: 'Trip',
      countryCodes: ['EG'],
      startDate: '2026-02-28',
    });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });

  it('rejects legacy aliases, client day dates, and overlong itinerary titles', async () => {
    const legacyPayload = plainToInstance(CreateItineraryDto, {
      title: 'Trip',
      countryCodes: ['EG'],
      destinations: ['EG'],
      startDate: '2026-02-28',
      endDate: '2026-03-01',
      days: [{ cityId: 'cairo', date: '2026-02-28' }],
    });
    const legacyErrors = await validate(legacyPayload, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(legacyErrors.length).toBeGreaterThan(0);

    const overlong = plainToInstance(CreateItineraryDto, {
      title: 'x'.repeat(101),
      countryCodes: ['EG'],
      startDate: '2026-02-28',
    });
    expect(await validate(overlong)).not.toEqual([]);
  });

  it('rejects an empty country list', async () => {
    const dto = plainToInstance(CreateItineraryDto, {
      title: 'Trip',
      countryCodes: [],
      startDate: '2026-02-28',
    });
    expect(await validate(dto)).not.toEqual([]);
  });

  it('returns canonical fields and preserves legacy text in a separate response section', () => {
    const stored = {
      _id: 'itinerary-id',
      countryCodes: undefined,
      destinations: ['Old free-text destination'],
      startDate: new Date('2026-02-28T00:00:00.000Z'),
      endDate: new Date('2026-03-01T00:00:00.000Z'),
      days: [
        {
          order: 1,
          date: new Date('2026-02-28T00:00:00.000Z'),
          city: 'Old free-text city',
        },
      ],
      budgetEntries: [{ category: 'food', amount: 12, currency: 'EGP' }],
    };

    const response = (service as any).toResponse(stored);
    expect(response.countryCodes).toBeNull();
    expect(response.legacyData.destinations).toEqual(['Old free-text destination']);
    expect(response.days[0].cityId).toBeNull();
    expect(response.days[0].legacyData.city).toBe('Old free-text city');
    expect(response.days[0]).not.toHaveProperty('city');
    expect(response).not.toHaveProperty('destinations');
    expect(response).not.toHaveProperty('endDate');
    expect(response.budgetEntries).toEqual(stored.budgetEntries);
    expect(stored.destinations).toEqual(['Old free-text destination']);
    expect(stored.days[0].city).toBe('Old free-text city');
    expect(stored.endDate).toBeDefined();
  });

  it('does not emit legacy aliases when canonical fields exist', () => {
    const response = (service as any).toResponse({
      countryCodes: ['EG'],
      destinations: ['Old stale value'],
      days: [{ order: 1, cityId: 'cairo', city: 'Old stale city' }],
      budgetEntries: [],
    });
    expect(response.countryCodes).toEqual(['EG']);
    expect(response.days[0].cityId).toBe('cairo');
    expect(response.legacyData.destinations).toEqual(['Old stale value']);
    expect(response.days[0].legacyData.city).toBe('Old stale city');
    expect(response.days[0]).not.toHaveProperty('city');
  });

  it('updates supplied itinerary fields, validates countries, and recalculates dates without losing legacy or budget data', async () => {
    const itinerary: any = {
      _id: 'itinerary-id',
      title: 'Old title',
      description: 'Keep this',
      countryCodes: ['EG'],
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      days: [
        {
          order: 1,
          date: new Date('2026-01-01T00:00:00.000Z'),
          city: 'Legacy city',
          notes: 'Keep notes',
          images: ['image-url'],
          activities: [{ title: 'Walk' }],
        },
      ],
      budgetEntries: [{ category: 'food', amount: 30, currency: 'EGP' }],
      save: vi.fn(async function (this: any) { return this; }),
    };
    vi.spyOn(service as any, 'getOwnedItinerary').mockResolvedValue(itinerary);

    const response = await service.updateItinerary(
      'itinerary-id',
      { title: 'New title', countryCodes: ['eg'], startDate: '2026-02-28' },
      { sub: '64b000000000000000000001' } as any,
    );

    expect(itinerary.title).toBe('New title');
    expect(itinerary.description).toBe('Keep this');
    expect(itinerary.countryCodes).toEqual(['EG']);
    expect(itinerary.days[0].date.toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(itinerary.days[0].city).toBe('Legacy city');
    expect(itinerary.days[0].notes).toBe('Keep notes');
    expect(itinerary.days[0].images).toEqual(['image-url']);
    expect(itinerary.days[0].activities).toEqual([{ title: 'Walk' }]);
    expect(response.budgetEntries).toEqual(itinerary.budgetEntries);
    expect(response.legacyData).toBeUndefined();
    expect(response.days[0].legacyData.city).toBe('Legacy city');
  });

  it('rejects an empty itinerary update', async () => {
    vi.spyOn(service as any, 'getOwnedItinerary').mockResolvedValue({});
    await expect(
      service.updateItinerary('itinerary-id', {}, { sub: '64b000000000000000000001' } as any),
    ).rejects.toThrow('At least one itinerary field must be supplied');
  });

  it('rejects itinerary edits for a non-owner', async () => {
    const model = (service as any).itineraryModel;
    model.findById = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue({ userId: '64b000000000000000000009' }),
    });
    await expect(
      service.updateItinerary(
        '64b000000000000000000002',
        { title: 'Not mine' },
        { sub: '64b000000000000000000001' } as any,
      ),
    ).rejects.toThrow('You do not own this itinerary');
  });

  it('validates partial update fields and requires true deletion confirmation', async () => {
    const updateDto = plainToInstance(UpdateItineraryDto, {
      countryCodes: [],
      startDate: '2026-02-30',
    });
    expect(await validate(updateDto)).not.toEqual([]);

    const nullDto = plainToInstance(UpdateItineraryDto, { title: null });
    expect(await validate(nullDto)).not.toEqual([]);

    const falseConfirmation = plainToInstance(ConfirmItineraryDeletionDto, {
      confirmed: false,
    });
    expect(await validate(falseConfirmation)).not.toEqual([]);

    const missingConfirmation = plainToInstance(ConfirmItineraryDeletionDto, {});
    expect(await validate(missingConfirmation)).not.toEqual([]);
  });

  it('rejects invalid itinerary pagination values and accepts the fixed maximum page size', async () => {
    const invalidQueries = [
      { page: '0' },
      { page: '1.5' },
      { limit: '0' },
      { limit: '11' },
      { limit: '1.5' },
    ];

    for (const query of invalidQueries) {
      const dto = plainToInstance(ItinerariesPaginationQueryDto, query);
      expect(await validate(dto)).not.toEqual([]);
    }

    const maxQuery = plainToInstance(ItinerariesPaginationQueryDto, {
      page: '1',
      limit: '10',
    });
    expect(await validate(maxQuery)).toEqual([]);
    expect(maxQuery.limit).toBe(10);
  });

  it('rejects an invalid PATCH startDate directly in the service without saving', async () => {
    const itinerary: any = {
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      days: [{ order: 1, date: new Date('2026-01-01T00:00:00.000Z') }],
      save: vi.fn(),
    };
    vi.spyOn(service as any, 'getOwnedItinerary').mockResolvedValue(itinerary);

    await expect(
      service.updateItinerary(
        'itinerary-id',
        { startDate: '2026-02-30' },
        { sub: '64b000000000000000000001' } as any,
      ),
    ).rejects.toThrow('startDate is not a valid calendar date');

    expect(itinerary.save).not.toHaveBeenCalled();
    expect(itinerary.startDate.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('deletes only by itinerary ID and owner, and confirms exactly one deletion', async () => {
    const model = (service as any).itineraryModel;
    const exec = vi.fn().mockResolvedValue({ deletedCount: 1 });
    model.deleteOne = vi.fn().mockReturnValue({ exec });
    const id = '64b000000000000000000002';
    const ownerId = '64b000000000000000000001';

    await expect(
      service.deleteItinerary(id, { confirmed: true }, { sub: ownerId } as any),
    ).resolves.toEqual({ deleted: true, id });

    const filter = model.deleteOne.mock.calls[0][0];
    expect(String(filter._id)).toBe(id);
    expect(String(filter.userId)).toBe(ownerId);
  });

  it('does not report success when owner-scoped deletion matches no itinerary', async () => {
    const model = (service as any).itineraryModel;
    model.deleteOne = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    });
    await expect(
      service.deleteItinerary(
        '64b000000000000000000002',
        { confirmed: true },
        { sub: '64b000000000000000000001' } as any,
      ),
    ).rejects.toThrow('Itinerary not found');
  });

  it('rejects itinerary deletion without explicit confirmation', async () => {
    const model = (service as any).itineraryModel;
    model.deleteOne = vi.fn();
    await expect(
      service.deleteItinerary(
        '64b000000000000000000002',
        { confirmed: false },
        { sub: '64b000000000000000000001' } as any,
      ),
    ).rejects.toThrow('Itinerary deletion must be confirmed');
    expect(model.deleteOne).not.toHaveBeenCalled();
  });

  it('adds a day with a validated city and derives its order and UTC date', async () => {
    const existing = {
      order: 1,
      date: new Date('2026-01-30T00:00:00.000Z'),
      cityId: 'cairo',
      notes: 'Existing notes',
      activities: [{ title: 'Existing activity', cost: { amount: 10, currency: 'EGP' } }],
      images: ['existing-image'],
      city: 'Legacy Cairo',
    };
    const itinerary = makeItinerary([existing]);
    mockOwnedItinerary(itinerary);

    const response = await service.addDay(
      '64b000000000000000000002',
      { cityId: 'alexandria', notes: 'Arrival' },
      { sub: '64b000000000000000000001' } as any,
    );

    expect(reference.city).toHaveBeenCalledWith('alexandria');
    expect(itinerary.days[0]).toBe(existing);
    expect(itinerary.days[0]).toMatchObject({
      city: 'Legacy Cairo',
      notes: 'Existing notes',
      activities: existing.activities,
      images: ['existing-image'],
    });
    expect(itinerary.days[1]).toMatchObject({
      cityId: 'alexandria',
      notes: 'Arrival',
      order: 2,
      date: new Date('2026-01-31T00:00:00.000Z'),
      activities: [],
      images: [],
    });
    expect(response.days.map((day: any) => day.order)).toEqual([1, 2]);
    expect(response.budgetEntries).toEqual(itinerary.budgetEntries);
  });

  it('allows adding the 60th day and rejects adding a 61st day', async () => {
    const days = Array.from({ length: 59 }, (_, index) => ({
      order: index + 1,
      date: new Date(Date.UTC(2026, 0, index + 1)),
      cityId: 'cairo',
      activities: [],
      images: [],
    }));
    const itinerary = makeItinerary(days);
    mockOwnedItinerary(itinerary);
    await service.addDay(
      '64b000000000000000000002',
      { cityId: 'cairo' },
      { sub: '64b000000000000000000001' } as any,
    );
    expect(itinerary.days).toHaveLength(60);
    expect(itinerary.days[59].order).toBe(60);

    const fullItinerary = makeItinerary(
      Array.from({ length: 60 }, (_, index) => ({ order: index + 1, date: new Date(), cityId: 'cairo' })),
    );
    mockOwnedItinerary(fullItinerary);
    await expect(
      service.addDay(
        '64b000000000000000000002',
        { cityId: 'cairo' },
        { sub: '64b000000000000000000001' } as any,
      ),
    ).rejects.toThrow('An itinerary cannot exceed 60 days');
    expect(fullItinerary.save).not.toHaveBeenCalled();
  });

  it('rejects an unknown city while adding a day', async () => {
    const itinerary = makeItinerary();
    mockOwnedItinerary(itinerary);
    reference.city.mockRejectedValueOnce(new Error('Unknown city'));
    await expect(
      service.addDay(
        '64b000000000000000000002',
        { cityId: 'unknown' },
        { sub: '64b000000000000000000001' } as any,
      ),
    ).rejects.toThrow('Unknown city');
    expect(itinerary.save).not.toHaveBeenCalled();
  });

  it('rejects day operations for a non-owner, an invalid itinerary ID, and a missing itinerary', async () => {
    const model = (service as any).itineraryModel;
    model.findById = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue({ userId: '64b000000000000000000009' }),
    });
    const user = { sub: '64b000000000000000000001' } as any;

    await expect(service.addDay('64b000000000000000000002', { cityId: 'cairo' }, user))
      .rejects.toThrow('You do not own this itinerary');
    await expect(service.updateDay('64b000000000000000000002', 1, { notes: 'x' }, user))
      .rejects.toThrow('You do not own this itinerary');
    await expect(service.deleteDay('64b000000000000000000002', 1, { confirmed: true }, user))
      .rejects.toThrow('You do not own this itinerary');
    await expect(service.moveDay('64b000000000000000000002', 1, { newDayOrder: 1 }, user))
      .rejects.toThrow('You do not own this itinerary');

    await expect(service.addDay('not-an-object-id', { cityId: 'cairo' }, user))
      .rejects.toThrow('Invalid itinerary ID');

    model.findById.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
    await expect(service.addDay('64b000000000000000000002', { cityId: 'cairo' }, user))
      .rejects.toThrow('Itinerary not found');
  });

  it('edits only supplied day fields and preserves nested and legacy data', async () => {
    const activities = [{ title: 'Tour', cost: { amount: 30, currency: 'EGP' } }];
    const day = {
      order: 1,
      date: new Date('2026-01-30T00:00:00.000Z'),
      cityId: 'cairo',
      city: 'Legacy Cairo',
      notes: 'Old note',
      activities,
      images: ['photo'],
      anotherNestedField: { keep: true },
    };
    const itinerary = makeItinerary([day]);
    mockOwnedItinerary(itinerary);

    const response = await service.updateDay(
      '64b000000000000000000002',
      1,
      { cityId: 'alexandria', notes: 'New note' },
      { sub: '64b000000000000000000001' } as any,
    );

    expect(reference.city).toHaveBeenCalledWith('alexandria');
    expect(itinerary.days[0]).toBe(day);
    expect(day).toMatchObject({
      order: 1,
      date: new Date('2026-01-30T00:00:00.000Z'),
      cityId: 'alexandria',
      city: 'Legacy Cairo',
      notes: 'New note',
      activities,
      images: ['photo'],
      anotherNestedField: { keep: true },
    });
    expect(response.days[0].legacyData.city).toBe('Legacy Cairo');
  });

  it('rejects an unknown city when editing a day', async () => {
    const itinerary = makeItinerary([{ order: 1, date: new Date(), cityId: 'cairo' }]);
    mockOwnedItinerary(itinerary);
    reference.city.mockRejectedValueOnce(new Error('Unknown city'));
    await expect(
      service.updateDay(
        '64b000000000000000000002',
        1,
        { cityId: 'unknown' },
        { sub: '64b000000000000000000001' } as any,
      ),
    ).rejects.toThrow('Unknown city');
    expect(itinerary.days[0].cityId).toBe('cairo');
    expect(itinerary.save).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent day and rejects nonpositive dayOrder values', async () => {
    const itinerary = makeItinerary([{ order: 1, date: new Date(), cityId: 'cairo' }]);
    mockOwnedItinerary(itinerary);
    await expect(
      service.updateDay('64b000000000000000000002', 2, { notes: 'x' }, { sub: 'owner' } as any),
    ).rejects.toThrow('Itinerary day not found');
    await expect(
      service.updateDay('64b000000000000000000002', 0, { notes: 'x' }, { sub: 'owner' } as any),
    ).rejects.toThrow('dayOrder must be a positive integer');
    await expect(
      service.updateDay('64b000000000000000000002', 1, {}, { sub: 'owner' } as any),
    ).rejects.toThrow('At least one day field must be supplied');
  });

  it('deletes only the confirmed day, keeps remaining original objects, and recalculates UTC dates', async () => {
    const first = {
      order: 1,
      date: new Date('2026-01-30T00:00:00.000Z'),
      cityId: 'cairo',
      city: 'Legacy Cairo',
      notes: 'Keep A',
      activities: [{ title: 'A' }],
      images: ['a.jpg'],
    };
    const removed = {
      order: 2,
      date: new Date('2026-01-31T00:00:00.000Z'),
      cityId: 'alexandria',
      city: 'Legacy Alexandria',
      notes: 'Delete me',
      activities: [{ title: 'B' }],
      images: ['b.jpg'],
    };
    const last = {
      order: 3,
      date: new Date('2026-02-01T00:00:00.000Z'),
      cityId: 'cairo',
      notes: 'Keep C',
      activities: [{ title: 'C' }],
      images: ['c.jpg'],
    };
    const budgets = [{ category: 'food', amount: 25, currency: 'EGP' }];
    const itinerary = makeItinerary([first, removed, last], { budgetEntries: budgets });
    mockOwnedItinerary(itinerary);

    const response = await service.deleteDay(
      '64b000000000000000000002',
      2,
      { confirmed: true },
      { sub: '64b000000000000000000001' } as any,
    );

    expect(itinerary.days[0]).toBe(first);
    expect(itinerary.days[1]).toBe(last);
    expect(itinerary.days).not.toContain(removed);
    expect(first).toMatchObject({ order: 1, date: new Date('2026-01-30T00:00:00.000Z'), city: 'Legacy Cairo', notes: 'Keep A', activities: [{ title: 'A' }], images: ['a.jpg'] });
    expect(last).toMatchObject({ order: 2, date: new Date('2026-01-31T00:00:00.000Z'), notes: 'Keep C', activities: [{ title: 'C' }], images: ['c.jpg'] });
    expect(itinerary.budgetEntries).toBe(budgets);
    expect(response.budgetEntries).toEqual(budgets);
  });

  it('deletes the first and last days while preserving the remaining original objects', async () => {
    for (const dayOrder of [1, 3]) {
      const first = { order: 1, date: new Date('2026-01-30T00:00:00.000Z'), cityId: 'cairo', notes: 'First', activities: [{ title: 'A' }], images: ['a.jpg'] };
      const middle = { order: 2, date: new Date('2026-01-31T00:00:00.000Z'), cityId: 'alexandria', city: 'Legacy Alex', notes: 'Middle', activities: [{ title: 'B' }], images: ['b.jpg'] };
      const last = { order: 3, date: new Date('2026-02-01T00:00:00.000Z'), cityId: 'cairo', notes: 'Last', activities: [{ title: 'C' }], images: ['c.jpg'] };
      const itinerary = makeItinerary([first, middle, last]);
      mockOwnedItinerary(itinerary);

      await service.deleteDay(
        '64b000000000000000000002',
        dayOrder,
        { confirmed: true },
        { sub: '64b000000000000000000001' } as any,
      );

      const expected = dayOrder === 1 ? [middle, last] : [first, middle];
      expect(itinerary.days).toHaveLength(2);
      expect(itinerary.days[0]).toBe(expected[0]);
      expect(itinerary.days[1]).toBe(expected[1]);
      expect(itinerary.days.map((day) => day.order)).toEqual([1, 2]);
      expect(itinerary.days.map((day) => day.date.toISOString())).toEqual([
        '2026-01-30T00:00:00.000Z',
        '2026-01-31T00:00:00.000Z',
      ]);
      expect(middle.city).toBe('Legacy Alex');
      expect(itinerary.days.map((day) => day.activities[0].title)).toEqual(
        expected.map((day) => day.activities[0].title),
      );
    }
  });

  it('requires confirmed=true and returns 404 for a nonexistent day deletion', async () => {
    const itinerary = makeItinerary([{ order: 1, date: new Date(), cityId: 'cairo' }]);
    mockOwnedItinerary(itinerary);
    await expect(
      service.deleteDay('64b000000000000000000002', 1, {} as any, { sub: 'owner' } as any),
    ).rejects.toThrow('Day deletion must be confirmed');
    await expect(
      service.deleteDay('64b000000000000000000002', 2, { confirmed: true }, { sub: 'owner' } as any),
    ).rejects.toThrow('Itinerary day not found');
    expect(itinerary.save).not.toHaveBeenCalled();
  });

  it('moves the original day object with all nested and legacy data and derives grouping order', async () => {
    const first = { order: 1, date: new Date(), cityId: 'cairo', city: 'Legacy A', notes: 'A', activities: [{ title: 'A' }], images: ['a.jpg'] };
    const second = { order: 2, date: new Date(), cityId: 'alexandria', city: 'Legacy B', notes: 'B', activities: [{ title: 'B' }], images: ['b.jpg'] };
    const third = { order: 3, date: new Date(), cityId: 'cairo', notes: 'C', activities: [{ title: 'C' }], images: ['c.jpg'] };
    const itinerary = makeItinerary([first, second, third]);
    mockOwnedItinerary(itinerary);

    const response = await service.moveDay(
      '64b000000000000000000002',
      2,
      { newDayOrder: 1 },
      { sub: '64b000000000000000000001' } as any,
    );

    expect(itinerary.days[0]).toBe(second);
    expect(itinerary.days[1]).toBe(first);
    expect(itinerary.days[2]).toBe(third);
    expect(second).toMatchObject({ order: 1, city: 'Legacy B', notes: 'B', activities: [{ title: 'B' }], images: ['b.jpg'] });
    expect(first).toMatchObject({ order: 2, city: 'Legacy A', notes: 'A', activities: [{ title: 'A' }], images: ['a.jpg'] });
    expect(third).toMatchObject({ order: 3, notes: 'C', activities: [{ title: 'C' }], images: ['c.jpg'] });
    expect(itinerary.days.map((day) => day.cityId)).toEqual(['alexandria', 'cairo', 'cairo']);
    expect(itinerary.days.map((day) => day.date.toISOString())).toEqual([
      '2026-01-30T00:00:00.000Z',
      '2026-01-31T00:00:00.000Z',
      '2026-02-01T00:00:00.000Z',
    ]);
    expect(response.days.map((day: any) => day.order)).toEqual([1, 2, 3]);
  });

  it('moves a day forward while preserving each original object and its nested data', async () => {
    const first = { order: 1, date: new Date(), cityId: 'cairo', city: 'Legacy Cairo', notes: 'A', activities: [{ title: 'A' }], images: ['a.jpg'] };
    const second = { order: 2, date: new Date(), cityId: 'alexandria', notes: 'B', activities: [{ title: 'B' }], images: ['b.jpg'] };
    const third = { order: 3, date: new Date(), cityId: 'giza', notes: 'C', activities: [{ title: 'C' }], images: ['c.jpg'] };
    const itinerary = makeItinerary([first, second, third]);
    mockOwnedItinerary(itinerary);

    await service.moveDay(
      '64b000000000000000000002',
      1,
      { newDayOrder: 3 },
      { sub: '64b000000000000000000001' } as any,
    );

    expect(itinerary.days).toEqual([second, third, first]);
    expect(itinerary.days[0]).toBe(second);
    expect(itinerary.days[1]).toBe(third);
    expect(itinerary.days[2]).toBe(first);
    expect(first).toMatchObject({ order: 3, city: 'Legacy Cairo', notes: 'A', activities: [{ title: 'A' }], images: ['a.jpg'] });
    expect(second).toMatchObject({ order: 1, notes: 'B', activities: [{ title: 'B' }], images: ['b.jpg'] });
    expect(third).toMatchObject({ order: 2, notes: 'C', activities: [{ title: 'C' }], images: ['c.jpg'] });
  });

  it('recalculates dates across December into January at UTC midnight', async () => {
    const first = { order: 1, date: new Date('2026-12-31T00:00:00.000Z'), cityId: 'cairo' };
    const second = { order: 2, date: new Date('2027-01-01T00:00:00.000Z'), cityId: 'alexandria' };
    const third = { order: 3, date: new Date('2027-01-02T00:00:00.000Z'), cityId: 'giza' };
    const itinerary = makeItinerary([first, second, third], {
      startDate: new Date('2026-12-31T18:30:00.000Z'),
    });
    mockOwnedItinerary(itinerary);

    await service.moveDay(
      '64b000000000000000000002',
      3,
      { newDayOrder: 1 },
      { sub: '64b000000000000000000001' } as any,
    );

    expect(itinerary.days.map((day) => day.date.toISOString())).toEqual([
      '2026-12-31T00:00:00.000Z',
      '2027-01-01T00:00:00.000Z',
      '2027-01-02T00:00:00.000Z',
    ]);
    expect(itinerary.days.map((day) => day.order)).toEqual([1, 2, 3]);
  });

  it('moves the original Mongoose day subdocument without rebuilding its nested content', async () => {
    const Model = mongoose.model('ItineraryDayOperationFixture', ItinerarySchema);
    const itinerary = new Model({
      title: 'Fixture',
      userId: new mongoose.Types.ObjectId('64b000000000000000000001'),
      startDate: new Date('2026-01-30T00:00:00.000Z'),
      days: [
        { order: 1, date: new Date('2026-01-30T00:00:00.000Z'), cityId: 'cairo', notes: 'A', images: ['a.jpg'] },
        { order: 2, date: new Date('2026-01-31T00:00:00.000Z'), city: 'Legacy Alexandria', cityId: 'alexandria', notes: 'B', activities: [{ title: 'B activity' }], images: ['b.jpg'] },
      ],
    });
    const originalMovedSubdocument = itinerary.days[1];
    vi.spyOn(itinerary, 'save').mockResolvedValue(itinerary as any);
    mockOwnedItinerary(itinerary);

    await service.moveDay(
      '64b000000000000000000002',
      2,
      { newDayOrder: 1 },
      { sub: '64b000000000000000000001' } as any,
    );

    expect(itinerary.days[0]).toBe(originalMovedSubdocument);
    expect(itinerary.days[0].toObject()).toMatchObject({
      city: 'Legacy Alexandria',
      cityId: 'alexandria',
      order: 1,
      date: new Date('2026-01-30T00:00:00.000Z'),
      notes: 'B',
      activities: [{ title: 'B activity', images: [] }],
      images: ['b.jpg'],
    });
  });

  it('supports no-op moves and rejects out-of-range target positions or missing source days', async () => {
    const first = { order: 1, date: new Date(), cityId: 'cairo' };
    const second = { order: 2, date: new Date(), cityId: 'alexandria' };
    const itinerary = makeItinerary([first, second]);
    mockOwnedItinerary(itinerary);
    await service.moveDay('64b000000000000000000002', 1, { newDayOrder: 1 }, { sub: 'owner' } as any);
    expect(itinerary.days[0]).toBe(first);
    await expect(
      service.moveDay('64b000000000000000000002', 1, { newDayOrder: 3 }, { sub: 'owner' } as any),
    ).rejects.toThrow('newDayOrder must be within the itinerary day range');
    await expect(
      service.moveDay('64b000000000000000000002', 3, { newDayOrder: 1 }, { sub: 'owner' } as any),
    ).rejects.toThrow('Itinerary day not found');
  });

  it('rejects bulk replacement when legacy city data cannot be identified safely', async () => {
    const itinerary = makeItinerary([
      { order: 1, city: 'Legacy Cairo', date: new Date(), activities: [{ title: 'Keep' }] },
    ]);
    mockOwnedItinerary(itinerary);
    const error = await service.updateDays(
      '64b000000000000000000002',
      { days: [{ order: 1, cityId: 'cairo' }] } as any,
      { sub: '64b000000000000000000001' } as any,
    ).catch((caught) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getStatus()).toBe(409);
    expect(error.message).toContain('Bulk day replacement is unavailable while legacy city data exists');
    expect(itinerary.save).not.toHaveBeenCalled();
    expect(itinerary.days[0].city).toBe('Legacy Cairo');
  });

  it('validates day-operation DTOs and rejects missing deletion confirmation', async () => {
    const createDto = plainToInstance(CreateItineraryDayDto, { cityId: 'cairo', notes: 'Note' });
    expect(await validate(createDto)).toEqual([]);
    const omittedNotes = plainToInstance(CreateItineraryDayDto, { cityId: 'cairo' });
    expect(await validate(omittedNotes)).toEqual([]);
    const nullNotes = plainToInstance(CreateItineraryDayDto, { cityId: 'cairo', notes: null });
    expect(await validate(nullNotes)).not.toEqual([]);
    const emptyPatch = plainToInstance(UpdateItineraryDayDto, {});
    expect(await validate(emptyPatch)).toEqual([]); // service rejects an empty patch
    const invalidMove = plainToInstance(MoveItineraryDayDto, { newDayOrder: 0 });
    expect(await validate(invalidMove)).not.toEqual([]);
    const missingConfirmation = plainToInstance(ConfirmDayDeletionDto, {});
    expect(await validate(missingConfirmation)).not.toEqual([]);
  });

  it('lists only owned itineraries in updatedAt order with pagination metadata', async () => {
    const model = (service as any).itineraryModel;
    const rows = [{ toObject: () => ({ _id: 'newest', countryCodes: ['EG'], days: [] }) }];
    const query = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(rows),
    };
    model.find = vi.fn().mockReturnValue(query);
    model.countDocuments = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(12) });

    const result = await service.findAll(
      { sub: '64b000000000000000000001' } as any,
      { page: 2, limit: 10 } as any,
    );

    expect(model.find).toHaveBeenCalledWith({ userId: expect.anything() });
    expect(model.countDocuments).toHaveBeenCalledWith(model.find.mock.calls[0][0]);
    expect(query.sort).toHaveBeenCalledWith({ updatedAt: -1 });
    expect(query.skip).toHaveBeenCalledWith(10);
    expect(query.limit).toHaveBeenCalledWith(10);
    expect(result).toMatchObject({ data: [{ _id: 'newest' }], page: 2, limit: 10, total: 12 });
  });
});
