import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { HotelsService } from './hotels.service.js';
import { Hotel } from './entities/hotel.entity.js';
import { HotelRoom } from './entities/hotel-room.entity.js';
import { Review } from '../reviews/entities/review.entity.js';

describe('HotelsService', () => {
  let service: HotelsService;
  const hotelModel = { findById: vi.fn() };
  const roomModel = { find: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HotelsService,
        { provide: getModelToken(Hotel.name), useValue: hotelModel },
        { provide: getModelToken(HotelRoom.name), useValue: roomModel },
        { provide: getModelToken(Review.name), useValue: {} },
      ],
    }).compile();

    service = module.get<HotelsService>(HotelsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns daily room availability with booking references', async () => {
    hotelModel.findById.mockReturnValue({
      exec: vi.fn().mockResolvedValue({ status: 'active' }),
    });
    roomModel.find.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        {
          _id: 'room-1',
          name: 'Room 1',
          availabilityRanges: [
            { startDate: '2030-01-01', endDate: '2030-01-04' },
          ],
          blockedDates: ['2030-01-03'],
          reservations: [
            {
              checkIn: new Date('2030-01-02T00:00:00.000Z'),
              checkOut: new Date('2030-01-03T00:00:00.000Z'),
              status: 'confirmed',
              reference: 'HTL-123',
            },
          ],
        },
      ]),
    });

    await expect(
      service.getAvailability('507f1f77bcf86cd799439011', {
        checkIn: '2030-01-01',
        checkOut: '2030-01-04',
      }),
    ).resolves.toEqual([
      {
        roomId: 'room-1',
        roomName: 'Room 1',
        dates: [
          { date: '2030-01-01', status: 'Available' },
          {
            date: '2030-01-02',
            status: 'Booked',
            reference: 'HTL-123',
          },
          { date: '2030-01-03', status: 'Blocked' },
        ],
      },
    ]);
  });

  it('filters occupied rooms while returning free rooms regardless of individual capacity', async () => {
    const checkIn = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const checkOut = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const checkInAt = new Date(`${checkIn}T00:00:00.000Z`);
    const checkOutAt = new Date(`${checkOut}T00:00:00.000Z`);
    const rooms = [
      {
        _id: 'small-free-room',
        name: 'Twin',
        maxOccupancy: 2,
        pricePerNight: 12000,
        availabilityRanges: [{ startDate: checkIn, endDate: checkOut }],
        blockedDates: [],
        reservations: [],
        toObject() {
          return {
            _id: this._id,
            name: this.name,
            maxOccupancy: this.maxOccupancy,
            pricePerNight: this.pricePerNight,
            reservations: this.reservations,
          };
        },
      },
      {
        _id: 'occupied-room',
        name: 'Family',
        maxOccupancy: 5,
        pricePerNight: 18000,
        availabilityRanges: [{ startDate: checkIn, endDate: checkOut }],
        blockedDates: [],
        reservations: [
          {
            checkIn: checkInAt,
            checkOut: checkOutAt,
            status: 'confirmed',
            expiresAt: new Date(),
          },
        ],
        toObject() {
          return {
            _id: this._id,
            name: this.name,
            maxOccupancy: this.maxOccupancy,
            pricePerNight: this.pricePerNight,
            reservations: this.reservations,
          };
        },
      },
    ];
    hotelModel.findById.mockReturnValue({
      exec: vi.fn().mockResolvedValue({ status: 'active' }),
    });
    const findQuery = { exec: vi.fn().mockResolvedValue(rooms) };
    roomModel.find.mockReturnValue(findQuery);

    const result = await service.getAvailableRooms(
      '507f1f77bcf86cd799439011',
      checkIn,
      checkOut,
    );

    expect(roomModel.find).toHaveBeenCalledWith({
      hotelId: '507f1f77bcf86cd799439011',
      isActive: true,
    });
    expect(findQuery.exec).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      _id: 'small-free-room',
      maxOccupancy: 2,
      totalStayPrice: 24000,
    });
    expect(result[0]).not.toHaveProperty('reservations');
  });
});
