import { Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Airport, Attraction, City, Country, Currency } from './schemas/reference.schemas.js';
import { ReferenceSeeder } from './reference.seeder.js';

const escape = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

/**
 * Read access to reference data for every module. Inject it (it is global) to validate ids, e.g.
 *   await this.reference.airport('CAI')   -> throws 404 if the airport does not exist
 */
@Injectable()
export class ReferenceService implements OnApplicationBootstrap {
  private readonly logger = new Logger('ReferenceService');

  constructor(
    @InjectModel(Country.name) private readonly countriesModel: Model<Country>,
    @InjectModel(City.name) private readonly citiesModel: Model<City>,
    @InjectModel(Airport.name) private readonly airportsModel: Model<Airport>,
    @InjectModel(Attraction.name) private readonly attractionsModel: Model<Attraction>,
    @InjectModel(Currency.name) private readonly currenciesModel: Model<Currency>,
    private readonly seeder: ReferenceSeeder,
    private readonly config: ConfigService,
  ) {}

  /** GEN-12: seed at setup. Upserts are idempotent, so this is safe on every start. */
  async onApplicationBootstrap() {
    if (this.config.get('SEED_ON_START') === 'false') return;
    try {
      await this.seeder.run();
    } catch (err) {
      this.logger.error(`Reference seeding failed: ${(err as Error).message}`);
    }
  }

  countries(search?: string) {
    return this.countriesModel.find(search ? { name: escape(search) } : {}).sort({ name: 1 }).lean();
  }

  cities(filter: { country?: string; search?: string }) {
    const q: Record<string, unknown> = {};
    if (filter.country) q.countryCode = filter.country.toUpperCase();
    if (filter.search) q.name = escape(filter.search);
    return this.citiesModel.find(q).sort({ name: 1 }).lean();
  }

  airports(filter: { city?: string; country?: string; search?: string }) {
    const q: Record<string, unknown> = {};
    if (filter.city) q.cityId = filter.city;
    if (filter.country) q.countryCode = filter.country.toUpperCase();
    if (filter.search) q.$or = [{ _id: filter.search.toUpperCase() }, { name: escape(filter.search) }];
    return this.airportsModel.find(q).sort({ _id: 1 }).lean();
  }

  attractions(filter: { city?: string; search?: string }) {
    const q: Record<string, unknown> = {};
    if (filter.city) q.cityId = filter.city;
    if (filter.search) q.name = escape(filter.search);
    return this.attractionsModel.find(q).sort({ name: 1 }).lean();
  }

  currencies() {
    return this.currenciesModel.find().sort({ _id: 1 }).lean();
  }

  // ---- lookups for other modules (throw 404 when the id is unknown) ----

  async airport(code: string) {
    const a = await this.airportsModel.findById(code.toUpperCase()).lean();
    if (!a) throw new NotFoundException(`Unknown airport: ${code}`);
    return a;
  }

  async city(id: string) {
    const c = await this.citiesModel.findById(id).lean();
    if (!c) throw new NotFoundException(`Unknown city: ${id}`);
    return c;
  }

  async country(code: string) {
    const c = await this.countriesModel.findById(code.toUpperCase()).lean();
    if (!c) throw new NotFoundException(`Unknown country: ${code}`);
    return c;
  }

  async isSupportedCurrency(code: string) {
    return !!(await this.currenciesModel.exists({ _id: code.toUpperCase() }));
  }
}
