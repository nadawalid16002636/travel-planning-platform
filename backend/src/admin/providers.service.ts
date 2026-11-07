import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Types, type Connection, type Model } from 'mongoose';

export type ProviderType = 'airline' | 'hotel';

/**
 * Admin access to data owned by other modules (P2 flights, P3 hotels) without importing their modules.
 * Models are looked up by name on the shared connection, so the admin module keeps working even
 * while one of those modules is not merged yet.
 *   Airline (P2): `active: boolean`        Hotel (P3): `status: 'active' | 'inactive'`
 *   FlightBooking (P2): userId string, legs[], totalMinor, status 'pending-payment' | 'confirmed' | ...
 *   HotelBooking (P3): userId ObjectId, hotelId, checkIn/checkOut, totalAmount, status 'pending_payment' | ...
 */
@Injectable()
export class ProvidersService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  model<T = any>(name: string): Model<T> | undefined {
    return this.connection.models[name] as Model<T> | undefined;
  }

  private providerModel(type: ProviderType) {
    const model = this.model(type === 'airline' ? 'Airline' : 'Hotel');
    if (!model) throw new NotFoundException(`The ${type} module is not available`);
    return model;
  }

  /** ACC-13: the provider a moderator is linked to must exist. */
  async findProvider(type: ProviderType, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException(`Unknown ${type}: ${id}`);
    const provider = await this.providerModel(type).findById(id).lean<Record<string, any>>();
    if (!provider) throw new NotFoundException(`Unknown ${type}: ${id}`);
    return provider;
  }

  isActive(type: ProviderType, provider: Record<string, any>) {
    return type === 'airline' ? provider.active !== false : provider.status !== 'inactive';
  }

  /** ACC-15: deactivated providers are hidden from search and cannot be booked (P2/P3 enforce it). */
  async setActive(type: ProviderType, id: string, active: boolean) {
    const update = type === 'airline' ? { active } : { status: active ? 'active' : 'inactive' };
    const provider = await this.providerModel(type)
      .findByIdAndUpdate(id, { $set: update }, { new: true })
      .lean<Record<string, any>>();
    if (!provider) throw new NotFoundException(`Unknown ${type}: ${id}`);
    return { id: String(provider._id), type, name: provider.name, active: this.isActive(type, provider) };
  }

  /** User ids with upcoming Confirmed bookings at this provider (to notify them, ACC-15). */
  async upcomingCustomerIds(type: ProviderType, id: string): Promise<string[]> {
    const now = new Date();
    if (type === 'hotel') {
      const bookings = this.model('HotelBooking');
      if (!bookings) return [];
      const ids = await bookings.distinct('userId', {
        hotelId: new Types.ObjectId(id),
        status: 'confirmed',
        checkIn: { $gt: now },
      });
      return ids.map(String);
    }
    const flights = this.model('Flight');
    const bookings = this.model('FlightBooking');
    if (!flights || !bookings) return [];
    const flightIds = await flights.distinct('_id', { airlineId: new Types.ObjectId(id) });
    if (!flightIds.length) return [];
    const ids = await bookings.distinct('userId', {
      status: 'confirmed',
      legs: { $elemMatch: { flightId: { $in: flightIds }, departureAt: { $gt: now } } },
    });
    return ids.map(String);
  }

  /** ACC-12: does the user have an upcoming Confirmed flight or hotel booking? */
  async upcomingConfirmedBookings(userId: string) {
    const now = new Date();
    const flight = this.model('FlightBooking');
    const hotel = this.model('HotelBooking');
    const [flights, hotels] = await Promise.all([
      flight ? flight.countDocuments({ userId, status: 'confirmed', 'legs.0.departureAt': { $gt: now } }) : 0,
      hotel && Types.ObjectId.isValid(userId)
        ? hotel.countDocuments({ userId: new Types.ObjectId(userId), status: 'confirmed', checkIn: { $gt: now } })
        : 0,
    ]);
    return { flights, hotels };
  }
}
