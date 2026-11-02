import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { HotelsService } from './hotels.service.js';
import { Hotel } from './entities/hotel.entity.js';

describe('HotelsService', () => {
  let service: HotelsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HotelsService,
        { provide: getModelToken(Hotel.name), useValue: {} },
      ],
    }).compile();

    service = module.get<HotelsService>(HotelsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
