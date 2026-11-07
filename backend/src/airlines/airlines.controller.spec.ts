import { AirlinesController } from './airlines.controller.js';
import { P2Access } from '../p2/access.js';

describe('Airline management authorization', () => {
  const service: any = {
    create: vi.fn(),
    update: vi.fn(),
    setPolicy: vi.fn(),
  };
  const controller = new AirlinesController(service, new P2Access());
  const id = '507f1f77bcf86cd799439011';
  beforeEach(() => vi.clearAllMocks());
  it('rejects airline creation by moderators', () => {
    expect(() =>
      controller.create({} as any, {
        p2Principal: {
          id: 'm',
          roles: ['airline-moderator'],
          airlineIds: [id],
        },
      }),
    ).toThrow();
    expect(service.create).not.toHaveBeenCalled();
  });
  it('rejects modifications to another airline', () => {
    expect(() =>
      controller.update(
        id,
        {},
        {
          p2Principal: {
            id: 'm',
            roles: ['airline-moderator'],
            airlineIds: [],
          },
        },
      ),
    ).toThrow();
    expect(service.update).not.toHaveBeenCalled();
  });
  it('permits a policy update for the assigned airline', async () => {
    await controller.baggage(id, {} as any, {
      p2Principal: { id: 'm', roles: ['airline-moderator'], airlineIds: [id] },
    });
    expect(service.setPolicy).toHaveBeenCalledWith(id, 'baggagePolicy', {});
  });
});
