import { Injectable, OnModuleInit } from '@nestjs/common';
import { Types } from 'mongoose';
import { paginate } from '../common/pagination.dto.js';
import { UsersService } from '../users/users.service.js';
import { ListBookingsDto } from './dto/list-bookings.dto.js';
import { ProvidersService } from './providers.service.js';

export interface AdminBookingRow {
  type: 'flight' | 'hotel';
  id: string;
  reference: string | null;
  status: string;
  user: { id: string; name: string | null; email: string | null };
  provider: { id: string | null; name: string | null };
  startDate: Date | null; // flight departure / hotel check-in
  endDate: Date | null; // last flight arrival / hotel check-out
  amount: number;
  currency: string;
  createdAt: Date;
}

/** P2 stores flight statuses with dashes ('pending-payment'); P3 and this API use underscores. */
const flightStatus = (s: string) => s.replace(/_/g, '-');
const normalStatus = (s: string) => String(s).replace(/-/g, '_');

/** Minor units -> amount, respecting zero-decimal currencies such as JPY. */
function fromMinor(minor: number, currency: string) {
  let digits = 2;
  try {
    digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    /* unknown currency code: assume 2 */
  }
  return minor / 10 ** digits;
}

/**
 * ACC-17: read-only list of all flight and hotel bookings for admins.
 * ACC-12: also registers the "upcoming confirmed bookings" deactivation check.
 */
@Injectable()
export class AdminBookingsService implements OnModuleInit {
  constructor(
    private readonly providers: ProvidersService,
    private readonly users: UsersService,
  ) {}

  onModuleInit() {
    this.users.registerDeactivationCheck(async (userId) => {
      const { flights, hotels } = await this.providers.upcomingConfirmedBookings(userId);
      if (!flights && !hotels) return null;
      const parts = [flights && `${flights} flight`, hotels && `${hotels} hotel`].filter(Boolean).join(' and ');
      return `you have upcoming confirmed bookings (${parts})`;
    });
  }

  async list(q: ListBookingsDto) {
    const range: Record<string, Date> = {};
    if (q.from) range.$gte = new Date(q.from);
    if (q.to) range.$lte = new Date(new Date(q.to).getTime() + 864e5 - 1); // inclusive end day

    const flightModel = q.type === 'hotel' ? undefined : this.providers.model('FlightBooking');
    const hotelModel = q.type === 'flight' ? undefined : this.providers.model('HotelBooking');

    const flightFilter: Record<string, unknown> = {};
    if (q.status) flightFilter.status = flightStatus(q.status);
    if (range.$gte || range.$lte) flightFilter['legs.0.departureAt'] = range;

    const hotelFilter: Record<string, unknown> = {};
    if (q.status) hotelFilter.status = q.status;
    if (range.$gte || range.$lte) hotelFilter.checkIn = range;

    // newest first across both collections: take the first page*limit of each, merge, then slice
    const window = q.page * q.limit;
    const [flights, flightTotal, hotels, hotelTotal] = await Promise.all([
      flightModel ? flightModel.find(flightFilter).sort({ createdAt: -1 }).limit(window).lean<any[]>() : [],
      flightModel ? flightModel.countDocuments(flightFilter) : 0,
      hotelModel ? hotelModel.find(hotelFilter).sort({ createdAt: -1 }).limit(window).lean<any[]>() : [],
      hotelModel ? hotelModel.countDocuments(hotelFilter) : 0,
    ]);

    const merged = [
      ...flights.map((b) => ({ type: 'flight' as const, b })),
      ...hotels.map((b) => ({ type: 'hotel' as const, b })),
    ]
      .sort((x, y) => new Date(y.b.createdAt).getTime() - new Date(x.b.createdAt).getTime())
      .slice((q.page - 1) * q.limit, window);

    const rows = await this.toRows(merged);
    return paginate(rows, flightTotal + hotelTotal, q);
  }

  private async toRows(items: Array<{ type: 'flight' | 'hotel'; b: any }>): Promise<AdminBookingRow[]> {
    // batch-load users, airlines (via flights) and hotels
    const userIds = [...new Set(items.map((i) => String(i.b.userId)))].filter((id) => Types.ObjectId.isValid(id));
    const flightIds = [
      ...new Set(items.filter((i) => i.type === 'flight').map((i) => String(i.b.legs?.[0]?.flightId))),
    ].filter((id) => Types.ObjectId.isValid(id));
    const hotelIds = [...new Set(items.filter((i) => i.type === 'hotel').map((i) => String(i.b.hotelId)))].filter(
      (id) => Types.ObjectId.isValid(id),
    );

    const flightModel = this.providers.model('Flight');
    const airlineModel = this.providers.model('Airline');
    const hotelModel = this.providers.model('Hotel');

    const [users, flightDocs, hotelDocs] = await Promise.all([
      this.users.basicInfo(userIds),
      flightModel && flightIds.length
        ? flightModel.find({ _id: { $in: flightIds } }).select('airlineId').lean<any[]>()
        : [],
      hotelModel && hotelIds.length ? hotelModel.find({ _id: { $in: hotelIds } }).select('name').lean<any[]>() : [],
    ]);
    const airlineIds = [...new Set(flightDocs.map((f) => String(f.airlineId)))];
    const airlineDocs =
      airlineModel && airlineIds.length
        ? await airlineModel.find({ _id: { $in: airlineIds } }).select('name').lean<any[]>()
        : [];

    const userMap = new Map(users.map((u) => [u.id, u]));
    const flightAirline = new Map(flightDocs.map((f) => [String(f._id), String(f.airlineId)]));
    const airlineName = new Map(airlineDocs.map((a) => [String(a._id), a.name as string]));
    const hotelName = new Map(hotelDocs.map((h) => [String(h._id), h.name as string]));

    return items.map(({ type, b }) => {
      const u = userMap.get(String(b.userId));
      const user = { id: String(b.userId), name: u?.name ?? null, email: u?.email ?? null };
      if (type === 'flight') {
        const airlineId = flightAirline.get(String(b.legs?.[0]?.flightId)) ?? null;
        const legs: any[] = b.legs ?? [];
        return {
          type,
          id: String(b._id),
          reference: b.reference ?? null,
          status: normalStatus(b.status),
          user,
          provider: { id: airlineId, name: airlineId ? (airlineName.get(airlineId) ?? null) : null },
          startDate: legs[0]?.departureAt ?? null,
          endDate: legs[legs.length - 1]?.arrivalAt ?? null,
          amount: fromMinor(b.totalMinor ?? 0, b.currency),
          currency: b.currency,
          createdAt: b.createdAt,
        };
      }
      return {
        type,
        id: String(b._id),
        reference: b.reference ?? null,
        status: normalStatus(b.status),
        user,
        provider: { id: String(b.hotelId), name: hotelName.get(String(b.hotelId)) ?? null },
        startDate: b.checkIn ?? null,
        endDate: b.checkOut ?? null,
        amount: b.totalAmount ?? 0,
        currency: b.currency,
        createdAt: b.createdAt,
      };
    });
  }
}
