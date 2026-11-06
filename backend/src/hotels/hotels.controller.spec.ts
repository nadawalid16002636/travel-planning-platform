import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { HotelsController } from './hotels.controller.js';
import { HotelsService } from './hotels.service.js';
import { Hotel } from './entities/hotel.entity.js';
import { HotelRoom } from './entities/hotel-room.entity.js';

describe('HotelsController', () => {
  let controller: HotelsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HotelsController],
      providers: [
        HotelsService,
        { provide: getModelToken(Hotel.name), useValue: {} },
        { provide: getModelToken(HotelRoom.name), useValue: {} },
      ],
    }).compile();

    controller = module.get<HotelsController>(HotelsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
