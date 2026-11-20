/**
 * npm run seed:demo — demo data for presentations and testing (P7).
 * Creates airlines + airline moderators, hotels + rooms + hotel moderators, and demo travelers.
 * Idempotent: everything is upserted by a natural key (airline code, hotel name+city,
 * room hotelId+name, user email), so it is safe to run repeatedly.
 * Run `npm run seed` first (reference data + admin account).
 */
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { AppModule } from './app.module.js';
import { Role } from './common/roles.js';
import { Airline } from './airlines/schemas/airline.schema.js';
import { Hotel } from './hotels/entities/hotel.entity.js';
import { HotelRoom } from './hotels/entities/hotel-room.entity.js';
import { AccountStatus, ProviderType, User } from './users/schemas/user.schema.js';
import { City, Country } from './reference/schemas/reference.schemas.js';
import { Post, PostStatus } from './posts/post.schema.js';

const DEMO_PASSWORD = 'Demo@12345';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const localDate = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

/** The moderator role names are defined by the team's Role enum; find them by name. */
function roleLike(re: RegExp): Role {
  const hit = Object.entries(Role).find(([k, v]) => re.test(k) || re.test(String(v)));
  if (!hit) throw new Error(`No role in common/roles.ts matches ${re}. Check the Role enum.`);
  return hit[1] as Role;
}

const AIRLINES = [
  { code: 'MS', name: 'EgyptAir', country: 'Egypt', description: 'Egypt national carrier.', checkedKg: 23, cabinKg: 8, bagPrice: 5000 },
  { code: 'LH', name: 'Lufthansa', country: 'Germany', description: 'German flag carrier.', checkedKg: 23, cabinKg: 8, bagPrice: 6500 },
  { code: 'EK', name: 'Emirates', country: 'United Arab Emirates', description: 'Dubai-based international airline.', checkedKg: 30, cabinKg: 7, bagPrice: 7000 },
];

const HOTELS = [
  { name: 'Grand Palace Hotel', star: 5, address: '1 Central Avenue', amenities: ['wifi', 'pool', 'spa', 'gym', 'breakfast'] },
  { name: 'Skyline Suites', star: 4, address: '25 Downtown Street', amenities: ['wifi', 'gym', 'breakfast'] },
  { name: 'Garden Bay Resort', star: 3, address: '8 Seaside Road', amenities: ['wifi', 'pool', 'parking'] },
];

const ROOM_TYPES = [
  { name: 'Standard Single', type: 'single', beds: 1, occ: 1, price: 60 },
  { name: 'Standard Double', type: 'double', beds: 1, occ: 2, price: 90 },
  { name: 'Family Room', type: 'family', beds: 3, occ: 4, price: 150 },
  { name: 'Deluxe Suite', type: 'suite', beds: 2, occ: 3, price: 250 },
];
const DEMO_FLIGHTS = [
  {
    airlineCode: 'MS',
    flightNumber: 'MS777',
    departureAirport: 'CAI',
    arrivalAirport: 'LHR',
    daysFromNow: 7,
    durationHours: 5,
    economyPrice: 25000,
    businessPrice: 75000,
  },
  {
    airlineCode: 'LH',
    flightNumber: 'LH100',
    departureAirport: 'FRA',
    arrivalAirport: 'CDG',
    daysFromNow: 10,
    durationHours: 2,
    economyPrice: 15000,
    businessPrice: 45000,
  },
  {
    airlineCode: 'EK',
    flightNumber: 'EK201',
    departureAirport: 'DXB',
    arrivalAirport: 'JFK',
    daysFromNow: 14,
    durationHours: 14,
    economyPrice: 55000,
    businessPrice: 150000,
  },
];
const DEMO_POSTS = [
  {
    traveler: 1,
    title: 'A Week Exploring Cairo',
    body: 'Discover the Pyramids of Giza, the Egyptian Museum, Khan el-Khalili, and the beautiful streets of Cairo.',
    status: PostStatus.PUBLISHED,
    tags: ['Egypt', 'Cairo', 'History'],
  },
  {
    traveler: 1,
    title: 'My Dream Trip to Japan',
    body: 'A travel plan covering Tokyo, Kyoto, traditional temples, Japanese food, and cherry blossom season.',
    status: PostStatus.DRAFT,
    tags: ['Japan', 'Tokyo', 'Culture'],
  },
  {
    traveler: 2,
    title: 'Exploring London in Five Days',
    body: 'Five days visiting Big Ben, Buckingham Palace, the British Museum, and other famous London attractions.',
    status: PostStatus.PUBLISHED,
    tags: ['London', 'UK', 'City Break'],
  },
  {
    traveler: 2,
    title: 'A Weekend in Paris',
    body: 'A weekend itinerary featuring the Eiffel Tower, Louvre Museum, local cafés, and Parisian streets.',
    status: PostStatus.PUBLISHED,
    tags: ['France', 'Paris', 'Travel'],
  },
  {
    traveler: 3,
    title: 'Dubai Travel Guide',
    body: 'A guide to exploring Dubai, including Burj Khalifa, Dubai Marina, desert activities, and shopping.',
    status: PostStatus.PUBLISHED,
    tags: ['Dubai', 'UAE', 'Guide'],
  },
  {
    traveler: 3,
    title: 'Planning My Next Adventure',
    body: 'Ideas and notes for my next international trip, including destinations, budgets, and activities.',
    status: PostStatus.DRAFT,
    tags: ['Planning', 'Adventure'],
  },
];

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
try {
  const get = <T = any>(name: string) => app.get<Model<T>>(getModelToken(name), { strict: false }) as Model<any>;
  const airlines = get(Airline.name);
  const hotels = get(Hotel.name);
  const rooms = get(HotelRoom.name);
  const users = get(User.name);
  const cities = get(City.name);
  const countries = get(Country.name);
  const airports = get('Airport');
  const flights = get('Flight');
  const posts = get(Post.name);

  const cityList = await cities.find().sort({ _id: 1 }).lean();
  if (!cityList.length) throw new Error('No cities found. Run `npm run seed` (reference data) first.');
  const countryName = new Map((await countries.find().lean()).map((c: any) => [c._id, c.name]));

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const accounts: string[][] = [];

  const upsertUser = async (email: string, firstName: string, lastName: string, extra: Record<string, unknown> = {}) => {
    await users.findOneAndUpdate(
      { email },
      {
        $set: {
          email, firstName, lastName, passwordHash,
          status: AccountStatus.ACTIVE, mustChangePassword: false, termsAcceptedAt: new Date(),
          ...extra,
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
  };

  // ---- airlines + airline moderators ----
  const airlineRole = roleLike(/airline/i);
  for (const a of AIRLINES) {
    const doc = await airlines.findOneAndUpdate(
      { code: a.code },
      {
        $set: {
          code: a.code, name: a.name, country: a.country, description: a.description, active: true,
          baggagePolicy: {
            checkedBaggageKg: a.checkedKg, cabinBaggageKg: a.cabinKg,
            extraBagPriceMinor: a.bagPrice, maxExtraBagsPerPassenger: 2, currency: 'USD',
          },
          cancellationPolicy: {
            tiers: [
              { daysBeforeDeparture: 7, refundPercent: 100 },
              { daysBeforeDeparture: 3, refundPercent: 50 },
              { daysBeforeDeparture: 0, refundPercent: 0 },
            ],
          },
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    const email = `${a.code.toLowerCase()}.moderator@demo.travel`;
    await upsertUser(email, a.name, 'Moderator', {
      role: airlineRole, providerType: ProviderType.AIRLINE, providerId: doc!._id,
    });
    accounts.push(['airline moderator', email, a.name]);
  }

  // ---- hotels + rooms + hotel moderators ----
  const hotelRole = roleLike(/hotel/i);
  const from = iso(addDays(new Date(), 1));
  const to = iso(addDays(new Date(), 365));
  let roomCount = 0;
  for (const [i, h] of HOTELS.entries()) {
    const city: any = cityList[i % cityList.length];
    const country = countryName.get(city.countryCode) ?? city.countryCode;
    const hotel = await hotels.findOneAndUpdate(
      { name: h.name, city: city.name },
      {
        $set: {
          name: h.name, city: city.name, country, address: h.address,
          description: `${h.name} in ${city.name}.`, starRating: h.star, amenities: h.amenities, status: 'active',
          policy: {
            checkInTime: '15:00', checkOutTime: '11:00',
            cancellationTiers: [
              { daysBeforeCheckIn: 7, refundPercent: 100 },
              { daysBeforeCheckIn: 2, refundPercent: 50 },
              { daysBeforeCheckIn: 0, refundPercent: 0 },
            ],
          },
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    for (const [j, r] of ROOM_TYPES.entries()) {
      await rooms.findOneAndUpdate(
        { hotelId: hotel!._id, name: r.name },
        {
          $set: {
            hotelId: hotel!._id, name: r.name, type: r.type, bedCount: r.beds, maxOccupancy: r.occ,
            pricePerNight: r.price + h.star * 10, currency: 'USD', amenities: ['wifi', 'tv'],
            availabilityRanges: [{ startDate: from, endDate: to }],
            blockedDates: j === 3 ? [iso(addDays(new Date(), 20)), iso(addDays(new Date(), 21))] : [],
            isActive: true,
          },
          $setOnInsert: { reservations: [], everReserved: false },
        },
        { upsert: true, setDefaultsOnInsert: true },
      );
      roomCount++;
    }
    const email = `hotel${i + 1}.moderator@demo.travel`;
    await upsertUser(email, h.name, 'Moderator', {
      role: hotelRole, providerType: ProviderType.HOTEL, providerId: hotel!._id,
    });
    accounts.push(['hotel moderator', email, h.name]);
  }

// ---- demo flights ----
  let flightCount = 0;

  for (const f of DEMO_FLIGHTS) {
    const airline = await airlines.findOne({ code: f.airlineCode }).lean();
    const departure = await airports.findById(f.departureAirport).lean();
    const arrival = await airports.findById(f.arrivalAirport).lean();

    if (!airline) throw new Error(`Airline ${f.airlineCode} not found.`);
    if (!departure) throw new Error(`Airport ${f.departureAirport} not found.`);
    if (!arrival) throw new Error(`Airport ${f.arrivalAirport} not found.`);

    const departureAt = new Date();
    departureAt.setUTCDate(departureAt.getUTCDate() + f.daysFromNow);
    departureAt.setUTCHours(8, 0, 0, 0);

    const arrivalAt = new Date(
      departureAt.getTime() + f.durationHours * 60 * 60 * 1000,
    );

    const departureLocalDate = localDate(
      departureAt,
      departure.timeZone,
    );

    await flights.findOneAndUpdate(
      {
        airlineId: airline._id,
        flightNumber: f.flightNumber,
        departureLocalDate,
      },
      {
        $set: {
          flightNumber: f.flightNumber,
          airlineId: airline._id,
          departureAirport: f.departureAirport,
          arrivalAirport: f.arrivalAirport,
          departureTimeZone: departure.timeZone,
          arrivalTimeZone: arrival.timeZone,
          departureLocalDate,
          departureAt,
          arrivalAt,
          status: 'scheduled',
          cabins: [
            {
              cabinClass: 'economy',
              capacity: 180,
              freeBags: 1,
              maxWeightKgPerBag: 23,
              reserved: 0,
              priceMinor: f.economyPrice,
              currency: 'USD',
            },
            {
              cabinClass: 'business',
              capacity: 30,
              freeBags: 2,
              maxWeightKgPerBag: 32,
              reserved: 0,
              priceMinor: f.businessPrice,
              currency: 'USD',
            },
          ],
          policySnapshot: {
            baggagePolicy: airline.baggagePolicy,
            cancellationPolicy: airline.cancellationPolicy,
          },
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );

    flightCount++;
  }

  console.log(`Demo flights created/updated: ${flightCount}`);
  // ---- demo travelers ----
  for (const n of [1, 2, 3]) {
    const email = `traveler${n}@demo.travel`;
    await upsertUser(email, 'Demo', `Traveler ${n}`, { role: Role.USER });
    accounts.push(['traveler', email, '-']);
  }
// ---- demo blog posts ----
  let postCount = 0;

  for (const p of DEMO_POSTS) {
    const author = await users.findOne({
      email: `traveler${p.traveler}@demo.travel`,
    });

    if (!author) {
      throw new Error(`Demo traveler ${p.traveler} not found.`);
    }

    await posts.findOneAndUpdate(
      { authorId: author._id, title: p.title },
      {
        $set: {
          authorId: author._id,
          title: p.title,
          body: p.body,
          status: p.status,
          tags: p.tags,
          images: [],
          likes: [],
          comments: [],
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );

    postCount++;
  }

  console.log(`Demo blog posts created/updated: ${postCount}`);

  console.log(`\nDemo seed finished: ${AIRLINES.length} airlines, ${HOTELS.length} hotels, ${roomCount} rooms, ${accounts.length} accounts.`);
  console.log(`All demo accounts use the password: ${DEMO_PASSWORD}\n`);
  console.table(accounts.map(([role, email, provider]) => ({ role, email, provider })));
} finally {
  await app.close();
}