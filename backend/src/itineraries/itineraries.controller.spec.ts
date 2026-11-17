
import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { ItinerariesController } from './itineraries.controller.js';
import { ItinerariesService } from './itineraries.service.js';
import { IS_PUBLIC } from '../common/decorators.js';

describe('ItinerariesController', () => {
  let controller: ItinerariesController;

  const mockItinerariesService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    updateItinerary: vi.fn(),
    deleteItinerary: vi.fn(),
    addDay: vi.fn(),
    updateDay: vi.fn(),
    deleteDay: vi.fn(),
    moveDay: vi.fn(),
    updateDays: vi.fn(),
    createDayBudgetEntry: vi.fn(),
    updateDayBudgetEntry: vi.fn(),
    deleteDayBudgetEntry: vi.fn(),
    createDayTransportEntry: vi.fn(),
    updateDayTransportEntry: vi.fn(),
    deleteDayTransportEntry: vi.fn(),
    createActivity: vi.fn(),
    updateActivity: vi.fn(),
    deleteActivity: vi.fn(),
    getBudgetSummary: vi.fn(),
    searchPublic: vi.fn(),
    getPublicDetails: vi.fn(),
    clonePublicItinerary: vi.fn(),
    searchHotelsForCityGroup: vi.fn(),
    searchFlightsForItinerary: vi.fn(),
    associateFlightBooking: vi.fn(),
    removeFlightBookingAssociation: vi.fn(),
    exportPdf: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule =
      await Test.createTestingModule({
        controllers: [ItinerariesController],
        providers: [
          {
            provide: ItinerariesService,
            useValue: mockItinerariesService,
          },
        ],
      }).compile();

    controller = module.get<ItinerariesController>(
      ItinerariesController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('forwards pagination, owner, and itinerary update data', () => {
    const query = { page: 2, limit: 10 } as any;
    const user = { sub: 'owner-id' } as any;
    const dto = { title: 'Updated' } as any;
    controller.findAll(query, user);
    controller.updateItinerary('itinerary-id', dto, user);
    expect(mockItinerariesService.findAll).toHaveBeenCalledWith(user, query);
    expect(mockItinerariesService.updateItinerary).toHaveBeenCalledWith(
      'itinerary-id',
      dto,
      user,
    );
  });

  it('forwards public search/details and authenticated cloning', () => {
    const query = { keyword: 'Cairo', page: 1, limit: 10 } as any;
    const user = { sub: 'registered-user' } as any;
    controller.searchPublic(query);
    controller.getPublicDetails('public-id');
    controller.clonePublicItinerary('public-id', user);
    expect(mockItinerariesService.searchPublic).toHaveBeenCalledWith(query);
    expect(mockItinerariesService.getPublicDetails).toHaveBeenCalledWith('public-id');
    expect(mockItinerariesService.clonePublicItinerary).toHaveBeenCalledWith('public-id', user);
  });

  it('marks public browse routes guest-accessible while clone remains authentication-protected', () => {
    const prototype = ItinerariesController.prototype;
    expect(Reflect.getMetadata(IS_PUBLIC, prototype.searchPublic)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC, prototype.getPublicDetails)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC, prototype.clonePublicItinerary)).toBeUndefined();
  });

  it('forwards authenticated itinerary hotel and flight search requests', () => {
    const user = { sub: 'owner-id' } as any;
    const hotelQuery = { guests: 2, rooms: 1 } as any;
    const flightQuery = { departureAirport: 'CAI', tripType: 'one-way' } as any;
    controller.searchHotelsForCityGroup('itinerary-id', 3, hotelQuery, user);
    controller.searchFlightsForItinerary('itinerary-id', flightQuery, user);
    expect(mockItinerariesService.searchHotelsForCityGroup).toHaveBeenCalledWith(
      'itinerary-id', 3, hotelQuery, user,
    );
    expect(mockItinerariesService.searchFlightsForItinerary).toHaveBeenCalledWith(
      'itinerary-id', flightQuery, user,
    );
  });

  it('forwards deletion confirmation to the service', () => {
    const confirmation = { confirmed: true } as any;
    const user = { sub: 'owner-id' } as any;
    controller.deleteItinerary('itinerary-id', confirmation, user);
    expect(mockItinerariesService.deleteItinerary).toHaveBeenCalledWith(
      'itinerary-id',
      confirmation,
      user,
    );
  });

  it('forwards individual day operations to the service', () => {
    const id = 'itinerary-id';
    const dayOrder = 2;
    const user = { sub: 'owner-id' } as any;
    const createDto = { cityId: 'cairo', notes: 'Visit the museum' } as any;
    const updateDto = { notes: 'Updated note' } as any;
    const confirmation = { confirmed: true } as any;
    const moveDto = { newDayOrder: 1 } as any;

    controller.addDay(id, createDto, user);
    controller.updateDay(id, dayOrder, updateDto, user);
    controller.deleteDay(id, dayOrder, confirmation, user);
    controller.moveDay(id, dayOrder, moveDto, user);

    expect(mockItinerariesService.addDay).toHaveBeenCalledWith(id, createDto, user);
    expect(mockItinerariesService.updateDay).toHaveBeenCalledWith(id, dayOrder, updateDto, user);
    expect(mockItinerariesService.deleteDay).toHaveBeenCalledWith(id, dayOrder, confirmation, user);
    expect(mockItinerariesService.moveDay).toHaveBeenCalledWith(id, dayOrder, moveDto, user);
  });

  it('keeps forwarding the legacy full-replacement route', () => {
    const dto = { days: [] } as any;
    const user = { sub: 'owner-id' } as any;
    controller.updateDays('itinerary-id', dto, user);
    expect(mockItinerariesService.updateDays).toHaveBeenCalledWith('itinerary-id', dto, user);
  });

  it('forwards day-linked budget-entry CRUD with itinerary, day, entry, DTO, and owner context', () => {
    const user = { sub: 'owner-id' } as any;
    const createDto = { category: 'food', amount: 12, currency: 'EGP' } as any;
    const updateDto = { amount: 14 } as any;
    const id = '64b000000000000000000002';
    const entryId = '64b000000000000000000003';

    controller.createDayBudgetEntry(id, 2, createDto, user);
    controller.updateDayBudgetEntry(id, 2, entryId, updateDto, user);
    controller.deleteDayBudgetEntry(id, 2, entryId, user);

    expect(mockItinerariesService.createDayBudgetEntry).toHaveBeenCalledWith(id, 2, createDto, user);
    expect(mockItinerariesService.updateDayBudgetEntry).toHaveBeenCalledWith(id, 2, entryId, updateDto, user);
    expect(mockItinerariesService.deleteDayBudgetEntry).toHaveBeenCalledWith(id, 2, entryId, user);
  });

  it('forwards intercity transport CRUD with itinerary, day, entry, DTO, and owner context', () => {
    const id = '64b000000000000000000002';
    const dayOrder = 1;
    const dto = { mode: 'train', fromCityId: 'cairo', toCityId: 'alexandria', amount: 120, currency: 'EGP' } as any;
    const user = { sub: 'owner-id' } as any;

    controller.createDayTransportEntry(id, dayOrder, dto, user);
    const entryId = '64b000000000000000000003';
    const patch = { amount: 135 } as any;
    controller.updateDayTransportEntry(id, dayOrder, entryId, patch, user);
    controller.deleteDayTransportEntry(id, dayOrder, entryId, user);

    expect(mockItinerariesService.createDayTransportEntry).toHaveBeenCalledWith(id, dayOrder, dto, user);
    expect(mockItinerariesService.updateDayTransportEntry).toHaveBeenCalledWith(id, dayOrder, entryId, patch, user);
    expect(mockItinerariesService.deleteDayTransportEntry).toHaveBeenCalledWith(id, dayOrder, entryId, user);
  });

  it('forwards itinerary activity CRUD with owner and day/activity identifiers', () => {
    const id = '64b000000000000000000002';
    const dayOrder = 2;
    const activityId = '64b000000000000000000013';
    const user = { sub: 'owner-id' } as any;
    const createDto = { title: 'Museum' } as any;
    const updateDto = { title: 'Museum visit' } as any;

    controller.createActivity(id, dayOrder, createDto, user);
    controller.updateActivity(id, dayOrder, activityId, updateDto, user);
    controller.deleteActivity(id, dayOrder, activityId, user);

    expect(mockItinerariesService.createActivity).toHaveBeenCalledWith(id, dayOrder, createDto, user);
    expect(mockItinerariesService.updateActivity).toHaveBeenCalledWith(id, dayOrder, activityId, updateDto, user);
    expect(mockItinerariesService.deleteActivity).toHaveBeenCalledWith(id, dayOrder, activityId, user);
  });

  it('forwards the budget summary request with itinerary ID and authenticated owner', () => {
    const id = '64b000000000000000000002';
    const user = { sub: 'owner-id' } as any;
    controller.getBudgetSummary(id, user);
    expect(mockItinerariesService.getBudgetSummary).toHaveBeenCalledWith(id, user);
  });

  it('forwards flight-booking associations and PDF export with authenticated ownership context', async () => {
    const id = '64b000000000000000000002';
    const bookingId = '64b000000000000000000013';
    const user = { sub: 'owner-id' } as any;
    const dto = { bookingId } as any;
    controller.associateFlightBooking(id, 2, dto, user);
    controller.removeFlightBookingAssociation(id, 2, bookingId, user);
    mockItinerariesService.exportPdf.mockResolvedValue(Buffer.from('%PDF-1.4'));
    const file = await controller.exportPdf(id, user);
    expect(file).toBeInstanceOf(StreamableFile);
    expect(mockItinerariesService.associateFlightBooking).toHaveBeenCalledWith(id, 2, dto, user);
    expect(mockItinerariesService.removeFlightBookingAssociation).toHaveBeenCalledWith(id, 2, bookingId, user);
    expect(mockItinerariesService.exportPdf).toHaveBeenCalledWith(id, user);
  });
});
