
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

  it('', async () => {
    const query = { page: 2, limit: 10 } as any;
    const user = { sub: 'owner-id' } as any;
    const dto = { title: 'Updated' } as any;
    await controller.findAll(query, user);
    await controller.updateItinerary('itinerary-id', dto, user);
    expect(mockItinerariesService.findAll).toHaveBeenCalledWith(user, query);
    expect(mockItinerariesService.updateItinerary).toHaveBeenCalledWith(
      'itinerary-id',
      dto,
      user,
    );
  });

  it('', async () => {
    const query = { keyword: 'Cairo', page: 1, limit: 10 } as any;
    const user = { sub: 'registered-user' } as any;
    await controller.searchPublic(query);
    await controller.getPublicDetails('public-id');
    await controller.clonePublicItinerary('public-id', user);
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

  it('', async () => {
    const user = { sub: 'owner-id' } as any;
    const hotelQuery = { guests: 2, rooms: 1 } as any;
    const flightQuery = { departureAirport: 'CAI', tripType: 'one-way' } as any;
    await controller.searchHotelsForCityGroup('itinerary-id', 3, hotelQuery, user);
    await controller.searchFlightsForItinerary('itinerary-id', flightQuery, user);
    expect(mockItinerariesService.searchHotelsForCityGroup).toHaveBeenCalledWith(
      'itinerary-id', 3, hotelQuery, user,
    );
    expect(mockItinerariesService.searchFlightsForItinerary).toHaveBeenCalledWith(
      'itinerary-id', flightQuery, user,
    );
  });

  it('', async () => {
    const confirmation = { confirmed: true } as any;
    const user = { sub: 'owner-id' } as any;
    await controller.deleteItinerary('itinerary-id', confirmation, user);
    expect(mockItinerariesService.deleteItinerary).toHaveBeenCalledWith(
      'itinerary-id',
      confirmation,
      user,
    );
  });

  it('', async () => {
    const id = 'itinerary-id';
    const dayOrder = 2;
    const user = { sub: 'owner-id' } as any;
    const createDto = { cityId: 'cairo', notes: 'Visit the museum' } as any;
    const updateDto = { notes: 'Updated note' } as any;
    const confirmation = { confirmed: true } as any;
    const moveDto = { newDayOrder: 1 } as any;

    await controller.addDay(id, createDto, user);
    await controller.updateDay(id, dayOrder, updateDto, user);
    await controller.deleteDay(id, dayOrder, confirmation, user);
    await controller.moveDay(id, dayOrder, moveDto, user);

    expect(mockItinerariesService.addDay).toHaveBeenCalledWith(id, createDto, user);
    expect(mockItinerariesService.updateDay).toHaveBeenCalledWith(id, dayOrder, updateDto, user);
    expect(mockItinerariesService.deleteDay).toHaveBeenCalledWith(id, dayOrder, confirmation, user);
    expect(mockItinerariesService.moveDay).toHaveBeenCalledWith(id, dayOrder, moveDto, user);
  });

  it('', async () => {
    const dto = { days: [] } as any;
    const user = { sub: 'owner-id' } as any;
    await controller.updateDays('itinerary-id', dto, user);
    expect(mockItinerariesService.updateDays).toHaveBeenCalledWith('itinerary-id', dto, user);
  });

  it('', async () => {
    const user = { sub: 'owner-id' } as any;
    const createDto = { category: 'food', amount: 12, currency: 'EGP' } as any;
    const updateDto = { amount: 14 } as any;
    const id = '64b000000000000000000002';
    const entryId = '64b000000000000000000003';

    await controller.createDayBudgetEntry(id, 2, createDto, user);
    await controller.updateDayBudgetEntry(id, 2, entryId, updateDto, user);
    await controller.deleteDayBudgetEntry(id, 2, entryId, user);

    expect(mockItinerariesService.createDayBudgetEntry).toHaveBeenCalledWith(id, 2, createDto, user);
    expect(mockItinerariesService.updateDayBudgetEntry).toHaveBeenCalledWith(id, 2, entryId, updateDto, user);
    expect(mockItinerariesService.deleteDayBudgetEntry).toHaveBeenCalledWith(id, 2, entryId, user);
  });

  it('', async () => {
    const id = '64b000000000000000000002';
    const dayOrder = 1;
    const dto = { mode: 'train', fromCityId: 'cairo', toCityId: 'alexandria', amount: 120, currency: 'EGP' } as any;
    const user = { sub: 'owner-id' } as any;

    await controller.createDayTransportEntry(id, dayOrder, dto, user);
    const entryId = '64b000000000000000000003';
    const patch = { amount: 135 } as any;
    await controller.updateDayTransportEntry(id, dayOrder, entryId, patch, user);
    await controller.deleteDayTransportEntry(id, dayOrder, entryId, user);

    expect(mockItinerariesService.createDayTransportEntry).toHaveBeenCalledWith(id, dayOrder, dto, user);
    expect(mockItinerariesService.updateDayTransportEntry).toHaveBeenCalledWith(id, dayOrder, entryId, patch, user);
    expect(mockItinerariesService.deleteDayTransportEntry).toHaveBeenCalledWith(id, dayOrder, entryId, user);
  });

  it('', async () => {
    const id = '64b000000000000000000002';
    const dayOrder = 2;
    const activityId = '64b000000000000000000013';
    const user = { sub: 'owner-id' } as any;
    const createDto = { title: 'Museum' } as any;
    const updateDto = { title: 'Museum visit' } as any;

    await controller.createActivity(id, dayOrder, createDto, user);
    await controller.updateActivity(id, dayOrder, activityId, updateDto, user);
    await controller.deleteActivity(id, dayOrder, activityId, user);

    expect(mockItinerariesService.createActivity).toHaveBeenCalledWith(id, dayOrder, createDto, user);
    expect(mockItinerariesService.updateActivity).toHaveBeenCalledWith(id, dayOrder, activityId, updateDto, user);
    expect(mockItinerariesService.deleteActivity).toHaveBeenCalledWith(id, dayOrder, activityId, user);
  });

  it('', async () => {
    const id = '64b000000000000000000002';
    const user = { sub: 'owner-id' } as any;
    await controller.getBudgetSummary(id, user);
    expect(mockItinerariesService.getBudgetSummary).toHaveBeenCalledWith(id, user);
  });

  it('forwards flight-booking associations and PDF export with authenticated ownership context', async () => {
    const id = '64b000000000000000000002';
    const bookingId = '64b000000000000000000013';
    const user = { sub: 'owner-id' } as any;
    const dto = { bookingId } as any;
    await controller.associateFlightBooking(id, 2, dto, user);
    await controller.removeFlightBookingAssociation(id, 2, bookingId, user);
    mockItinerariesService.exportPdf.mockResolvedValue(Buffer.from('%PDF-1.4'));
    const file = await controller.exportPdf(id, user);
    expect(file).toBeInstanceOf(StreamableFile);
    expect(mockItinerariesService.associateFlightBooking).toHaveBeenCalledWith(id, 2, dto, user);
    expect(mockItinerariesService.removeFlightBookingAssociation).toHaveBeenCalledWith(id, 2, bookingId, user);
    expect(mockItinerariesService.exportPdf).toHaveBeenCalledWith(id, user);
  });
});
