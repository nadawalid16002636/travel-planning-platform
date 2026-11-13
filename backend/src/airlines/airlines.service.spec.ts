import { ConflictException, NotFoundException } from '@nestjs/common';
import { MongoServerError } from 'mongodb';
import { AirlinesService } from './airlines.service.js';

describe('AirlinesService error handling', () => {
  const id = '507f1f77bcf86cd799439011';
  it('maps duplicate identifier writes to HTTP 409', async () => {
    const model: any = {
      create: vi
        .fn()
        .mockRejectedValue(
          new MongoServerError({ code: 11000, message: 'duplicate' }),
        ),
    };
    await expect(
      new AirlinesService(model).create({
        name: 'Air',
        code: 'AA',
        country: 'EG',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('returns 404 for a missing airline', async () => {
    const model: any = { findById: () => ({ exec: async () => null }) };
    await expect(new AirlinesService(model).findOne(id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
  it('rejects invalid identifiers before querying MongoDB', async () => {
    await expect(
      new AirlinesService({} as any).findOne('bad'),
    ).rejects.toMatchObject({ status: 400 });
  });
});
