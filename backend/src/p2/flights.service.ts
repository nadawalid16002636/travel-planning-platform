import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { P2Access, P2Principal, objectId } from './access.js';
import { AirportsService } from './airports.service.js';
import {
  CabinDto,
  CreateFlightDto,
  SearchFlightsDto,
  UpdateCabinDto,
} from './dto.js';
import { P2Rules } from './rules.js';

export function localDate(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const value = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function airportLocalTime(instant: Date, timeZone: string) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .format(instant)
    .replace(' ', 'T');
}
export function airportInstant(input: string, timeZone: string) {
  if (/(Z|[+-]\d{2}:\d{2})$/.test(input)) return new Date(input);
  const wall = new Date(input + 'Z');
  if (!Number.isFinite(wall.getTime()))
    throw new BadRequestException('Invalid airport-local date-time');
  const normalized = wall.toISOString().slice(0, 19);
  const matches: Date[] = [];
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const candidate = new Date(wall.getTime() - offset * 60000);
    if (airportLocalTime(candidate, timeZone) === normalized)
      matches.push(candidate);
  }
  if (matches.length !== 1)
    throw new BadRequestException(
      'Nonexistent or ambiguous local time; supply an explicit UTC offset',
    );
  return matches[0];
}
@Injectable()
export class FlightsService {
  constructor(
    @InjectModel('Flight') readonly flights: Model<any>,
    @InjectModel('Airline') private readonly airlines: Model<any>,
    readonly airports: AirportsService,
    private readonly access: P2Access,
    private readonly rules: P2Rules,
  ) {}
  async get(id: string, session?: ClientSession) {
    const flight = await this.flights
      .findById(objectId(id))
      .session(session || null)
      .lean();
    if (!flight) throw new NotFoundException('Flight not found');
    return flight as any;
  }
  dates(departure: Date, arrival: Date) {
    if (
      !Number.isFinite(departure.getTime()) ||
      !Number.isFinite(arrival.getTime()) ||
      departure <= new Date() ||
      arrival <= departure
    ) {
      throw new BadRequestException(
        'Future departure and later arrival required',
      );
    }
  }
  async create(dto: CreateFlightDto, user: P2Principal) {
    this.access.manage(user, dto.airlineId);
    if (dto.departureAirport === dto.arrivalAirport)
      throw new BadRequestException('Airports must differ');
    const [airline, departure, arrival] = await Promise.all([
      this.airlines.findById(objectId(dto.airlineId)).lean() as Promise<any>,
      this.airports.byCode(dto.departureAirport),
      this.airports.byCode(dto.arrivalAirport),
    ]);
    if (!airline) throw new NotFoundException('Airline not found');
    if (airline.active === false)
      throw new ConflictException('Airline is inactive');
    const departureAt = airportInstant(dto.departureAt, departure.timeZone);
    const arrivalAt = airportInstant(dto.arrivalAt, arrival.timeZone);
    this.dates(departureAt, arrivalAt);
    if (!airline.baggagePolicy || !airline.cancellationPolicy)
      throw new ConflictException(
        'Airline policies required before scheduling flights',
      );
    if (new Set(dto.cabins.map((c: any) => c.currency)).size !== 1)
      throw new BadRequestException('All cabins must use the same currency');
    try {
      return await this.flights.create({
        ...dto,
        departureAt,
        arrivalAt,
        departureLocalDate: localDate(departureAt, departure.timeZone),
        departureTimeZone: departure.timeZone,
        arrivalTimeZone: arrival.timeZone,
        policySnapshot: {
          baggagePolicy: airline.baggagePolicy,
          cancellationPolicy: airline.cancellationPolicy,
        },
      });
    } catch (e: any) {
      if (e.code === 11000)
        throw new ConflictException(
          'Duplicate flight identifier and departure',
        );
      throw e;
    }
  }
  async details(id: string) {
    const f = await this.get(id);
    const [airline, departure, arrival] = await Promise.all([
      this.airlines
        .findById(f.airlineId)
        .select('name code logo active baggagePolicy cancellationPolicy')
        .lean(),
      this.airports.byCode(f.departureAirport),
      this.airports.byCode(f.arrivalAirport),
    ]);
    return {
      ...f,
      status:
        f.status === 'scheduled' && f.departureAt <= new Date()
          ? 'departed'
          : f.status,
      airline,
      policySnapshot: {
        baggagePolicy: (airline as any)?.baggagePolicy,
        cancellationPolicy: (airline as any)?.cancellationPolicy,
      },
      departure,
      arrival,
      departureAtLocal: airportLocalTime(f.departureAt, f.departureTimeZone),
      arrivalAtLocal: airportLocalTime(f.arrivalAt, f.arrivalTimeZone),
      durationMinutes:
        (f.arrivalAt.getTime() - f.departureAt.getTime()) / 60000,
      cabins: f.cabins.map((c: any) => ({
        ...c,
        availableSeats: c.capacity - c.reserved,
      })),
    };
  }
  async bookingPolicies(airlineId: string, session: ClientSession) {
    const airline: any = await this.airlines
      .findById(airlineId)
      .session(session)
      .lean();
    if (
      !airline ||
      airline.active === false ||
      !airline.baggagePolicy ||
      !airline.cancellationPolicy?.tiers
    )
      throw new ConflictException(
        'Active airline with complete policies required',
      );
    return {
      baggagePolicy: airline.baggagePolicy,
      cancellationPolicy: airline.cancellationPolicy,
    };
  }
  async cabin(
    id: string,
    dto: CabinDto | UpdateCabinDto,
    user: P2Principal,
    cabinId?: string,
  ) {
    const f = await this.get(id);
    this.access.manage(user, String(f.airlineId));
    if (f.status !== 'scheduled' || f.departureAt <= new Date())
      throw new ConflictException('Flight is not editable');
    const cabins = f.cabins.map((c: any) => ({ ...c }));
    if (cabinId) {
      objectId(cabinId);
      const target = cabins.find((c: any) => String(c._id) === cabinId);
      if (!target) throw new NotFoundException('Cabin not found');
      if (dto.capacity !== undefined && dto.capacity < target.reserved)
        throw new ConflictException(
          'Capacity cannot be below reserved inventory',
        );
      if (
        target.reserved &&
        dto.cabinClass &&
        dto.cabinClass !== target.cabinClass
      )
        throw new ConflictException('Reserved cabin cannot be renamed');
      Object.assign(target, dto);
    } else cabins.push({ ...dto, reserved: 0, _id: new Types.ObjectId() });
    if (
      new Set(cabins.map((c: any) => c.cabinClass)).size !== cabins.length ||
      new Set(cabins.map((c: any) => c.currency)).size !== 1
    )
      throw new BadRequestException(
        'Unique cabin classes and one currency required',
      );
    const result = await this.flights.findOneAndUpdate(
      { _id: f._id, revision: f.revision, status: 'scheduled' },
      { $set: { cabins }, $inc: { revision: 1 } },
      { new: true, runValidators: true },
    );
    if (!result) throw new ConflictException('Inventory changed; retry');
    return result;
  }
  async search(q: SearchFlightsDto) {
    if (
      q.departureAirport === q.arrivalAirport ||
      (q.tripType === 'round-trip' && !q.returnDate) ||
      (q.tripType === 'one-way' && q.returnDate) ||
      (q.returnDate && q.returnDate < q.departureDate) ||
      (q.minPriceMinor !== undefined &&
        q.maxPriceMinor !== undefined &&
        q.minPriceMinor > q.maxPriceMinor)
    )
      throw new BadRequestException('Invalid itinerary or price range');
    if (
      (q.sort.startsWith('price-') ||
        q.minPriceMinor !== undefined ||
        q.maxPriceMinor !== undefined) &&
      !q.currency
    )
      throw new BadRequestException('Currency required for price comparison');
    const seats = this.rules.counts(q.adults, q.children, q.infants);
    const [origin, destination] = await Promise.all([
      this.airports.byCode(q.departureAirport),
      this.airports.byCode(q.arrivalAirport),
    ]);
    if (q.departureDate < localDate(new Date(), origin.timeZone))
      throw new BadRequestException('Travel date is in the past');
    const leg = async (
      from: string,
      to: string,
      date: string,
      zone: string,
    ) => {
      // Wide UTC window, followed by exact airport-local date comparison (including DST).
      const start = new Date(`${date}T00:00:00Z`);
      const pipeline: any[] = [
        {
          $match: {
            departureAirport: from,
            arrivalAirport: to,
            status: 'scheduled',
            departureAt: {
              $gte: new Date(Math.max(Date.now(), start.getTime() - 86400000)),
              $lt: new Date(start.getTime() + 172800000),
            },
          },
        },
        {
          $match: {
            $expr: {
              $eq: [
                {
                  $dateToString: {
                    date: '$departureAt',
                    format: '%Y-%m-%d',
                    timezone: zone,
                  },
                },
                date,
              ],
            },
          },
        },
        {
          $lookup: {
            from: this.airlines.collection.name,
            localField: 'airlineId',
            foreignField: '_id',
            as: 'airline',
          },
        },
        {
          $match: {
            'airline.0': { $exists: true },
            'airline.active': { $ne: false },
          },
        },
        { $unwind: '$cabins' },
        {
          $match: {
            ...(q.cabinClass ? { 'cabins.cabinClass': q.cabinClass } : {}),
            ...(q.currency ? { 'cabins.currency': q.currency } : {}),
            ...(q.minPriceMinor !== undefined || q.maxPriceMinor !== undefined
              ? {
                  'cabins.priceMinor': {
                    ...(q.minPriceMinor !== undefined
                      ? { $gte: q.minPriceMinor }
                      : {}),
                    ...(q.maxPriceMinor !== undefined
                      ? { $lte: q.maxPriceMinor }
                      : {}),
                  },
                }
              : {}),
            $expr: {
              $gte: [
                { $subtract: ['$cabins.capacity', '$cabins.reserved'] },
                seats,
              ],
            },
          },
        },
        {
          $addFields: {
            availableSeats: {
              $subtract: ['$cabins.capacity', '$cabins.reserved'],
            },
            durationMinutes: {
              $divide: [{ $subtract: ['$arrivalAt', '$departureAt'] }, 60000],
            },
            departureAtLocal: {
              $dateToString: {
                date: '$departureAt',
                timezone: '$departureTimeZone',
              },
            },
            arrivalAtLocal: {
              $dateToString: {
                date: '$arrivalAt',
                timezone: '$arrivalTimeZone',
              },
            },
          },
        },
        {
          $sort:
            q.sort === 'departure'
              ? { departureAt: 1, _id: 1 }
              : q.sort === 'duration'
                ? { durationMinutes: 1, _id: 1 }
                : {
                    'cabins.priceMinor': q.sort === 'price-desc' ? -1 : 1,
                    _id: 1,
                  },
        },
        {
          $facet: {
            items: [{ $skip: (q.page - 1) * q.limit }, { $limit: q.limit }],
            count: [{ $count: 'total' }],
          },
        },
      ];
      const [result] = await this.flights.aggregate(pipeline);
      return {
        items: result.items,
        total: result.count[0]?.total || 0,
        page: q.page,
        limit: q.limit,
        ...(result.items.length ? {} : { message: 'no flights found' }),
      };
    };
    return {
      outbound: await leg(
        q.departureAirport,
        q.arrivalAirport,
        q.departureDate,
        origin.timeZone,
      ),
      ...(q.tripType === 'round-trip'
        ? {
            inbound: await leg(
              q.arrivalAirport,
              q.departureAirport,
              q.returnDate!,
              destination.timeZone,
            ),
          }
        : {}),
    };
  }
}
