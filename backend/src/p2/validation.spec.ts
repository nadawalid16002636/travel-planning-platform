import { P2Rules } from './rules';
import { P2Access, objectId } from './access';
import { airportInstant, localDate } from './flights.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateFlightDto, CreateBookingDto, SearchFlightsDto } from './dto';

// Explicit synthetic test policy; these are not claimed to be official workbook rules.
export const TEST_RULES = {
  source: 'synthetic unit-test fixture',
  adultMinAge: 18,
  childMinAge: 2,
  maxPassengers: 9,
  maxInfantsPerAdult: 1,
  infantOccupiesSeat: false,
  childFarePercent: 75,
  infantFarePercent: 10,
};

describe('P2 validation and security', () => {
  it('converts airport-local times to UTC and rejects DST gaps and overlaps', () => {
    expect(
      airportInstant('2027-01-01T12:00:00', 'Africa/Cairo').toISOString(),
    ).toBe('2027-01-01T10:00:00.000Z');
    expect(() =>
      airportInstant('2027-03-14T02:30:00', 'America/New_York'),
    ).toThrow();
    expect(() =>
      airportInstant('2027-11-07T01:30:00', 'America/New_York'),
    ).toThrow();
    expect(
      airportInstant(
        '2027-11-07T01:30:00-04:00',
        'America/New_York',
      ).toISOString(),
    ).toBe('2027-11-07T05:30:00.000Z');
  });
  const rules = new P2Rules();
  beforeEach(() => rules.configure(TEST_RULES));
  it('uses the official FLT-12 default age, fare and inventory rules', () => {
    const official = new P2Rules();
    expect(official.counts(1, 1, 1)).toBe(2);
    expect(
      official.fare([{ type: 'child' }, { type: 'infant' }] as any, 1000),
    ).toBe(1100);
  });
  it('enforces age at departure and seated passenger counts', () => {
    expect(
      rules.validate(
        [
          {
            name: 'Adult',
            type: 'adult',
            dateOfBirth: '2000-01-01',
            documentNumber: 'A',
          },
          {
            name: 'Infant',
            type: 'infant',
            dateOfBirth: '2026-06-01',
            documentNumber: 'B',
          },
        ],
        new Date('2027-01-01'),
      ),
    ).toBe(1);
    expect(() =>
      rules.validate(
        [
          {
            name: 'Wrong',
            type: 'adult',
            dateOfBirth: '2026-06-01',
            documentNumber: 'A',
          },
        ],
        new Date('2027-01-01'),
      ),
    ).toThrow();
    expect(() => rules.counts(1, 0, 2)).toThrow();
    expect(() => rules.counts(0, 1, 0)).toThrow();
    expect(() => rules.counts(9, 1, 0)).toThrow();
  });
  it('calculates configured child and infant fares in minor units', () => {
    expect(
      rules.fare(
        [{ type: 'adult' }, { type: 'child' }, { type: 'infant' }] as any,
        1000,
      ),
    ).toBe(1850);
  });
  it('uses airport-local dates around UTC midnight and DST', () => {
    expect(localDate(new Date('2027-01-01T23:30:00Z'), 'Asia/Tokyo')).toBe(
      '2027-01-02',
    );
    expect(
      localDate(new Date('2027-07-01T03:30:00Z'), 'America/New_York'),
    ).toBe('2027-06-30');
  });
  it('does not trust a request-populated principal without a registered P1 adapter', async () => {
    const context: any = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles: ['admin'] } }),
      }),
    };
    await expect(new P2Access().canActivate(context)).rejects.toMatchObject({
      status: 401,
    });
  });
  it('accepts only strict MongoDB identifiers', () => {
    expect(() => objectId('123456789012')).toThrow();
  });
  it('validates nested cabins and rejects invalid flight instants', async () => {
    const dto = plainToInstance(CreateFlightDto, {
      flightNumber: 'MS123',
      airlineId: '507f1f77bcf86cd799439011',
      departureAirport: 'CAI',
      arrivalAirport: 'LHR',
      departureAt: 'invalid',
      arrivalAt: '2027-01-01T15:00:00Z',
      cabins: [
        {
          cabinClass: 'invalid',
          capacity: -1,
          priceMinor: -1,
          currency: 'usd',
        },
      ],
    });
    expect((await validate(dto)).map((e) => e.property)).toEqual(
      expect.arrayContaining(['departureAt', 'cabins']),
    );
  });
  it('requires boolean policy acceptance, passengers and valid search parameters', async () => {
    expect(
      (
        await validate(
          plainToInstance(CreateBookingDto, {
            acceptedPolicies: 'true',
            passengers: [],
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await validate(
          plainToInstance(SearchFlightsDto, {
            departureAirport: 'BADCODE',
            arrivalAirport: 'LHR',
            departureDate: '2027-02-30',
            adults: -1,
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
