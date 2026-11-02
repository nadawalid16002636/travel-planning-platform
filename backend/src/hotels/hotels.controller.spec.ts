import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { HotelsController } from './hotels.controller';
import { HotelsService } from './hotels.service';
import { Hotel } from './entities/hotel.entity';

describe('HotelsController', () => {
  let controller: HotelsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HotelsController],
      providers: [
        HotelsService,
        { provide: getModelToken(Hotel.name), useValue: {} },
      ],
    }).compile();

    controller = module.get<HotelsController>(HotelsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
