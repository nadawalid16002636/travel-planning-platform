import { Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Airport, Attraction, City, Country, Currency } from './schemas/reference.schemas.js';
import { ReferenceSeeder } from './reference.seeder.js';
import { paginate, PaginationQueryDto } from '../common/pagination.dto.js';
import { AirportsQueryDto, AttractionsQueryDto, CitiesQueryDto, SearchQueryDto } from './dto/reference-query.dto.js';

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

  /** GEN-05: one paginated query shape for every reference list. */
  private async page<T>(model: Model<T>, q: Record<string, unknown>, sort: Record<string, 1>, p: PaginationQueryDto) {
    const [data, total] = await Promise.all([
      model.find(q as any).sort(sort).skip((p.page - 1) * p.limit).limit(p.limit).lean(),
      model.countDocuments(q as any),
    ]);
    return paginate(data, total, p);
  }

  countries(p: SearchQueryDto) {
    return this.page(this.countriesModel, p.search ? { name: escape(p.search) } : {}, { name: 1 }, p);
  }

  cities(p: CitiesQueryDto) {
    const q: Record<string, unknown> = {};
    if (p.country) q.countryCode = p.country.toUpperCase();
    if (p.search) q.name = escape(p.search);
    return this.page(this.citiesModel, q, { name: 1 }, p);
  }

  airports(p: AirportsQueryDto) {
    const q: Record<string, unknown> = {};
    if (p.city) q.cityId = p.city;
    if (p.country) q.countryCode = p.country.toUpperCase();
    if (p.search) q.$or = [{ _id: p.search.toUpperCase() }, { name: escape(p.search) }];
    return this.page(this.airportsModel, q, { _id: 1 }, p);
  }

  attractions(p: AttractionsQueryDto) {
    const q: Record<string, unknown> = {};
    if (p.city) q.cityId = p.city;
    if (p.search) q.name = escape(p.search);
    return this.page(this.attractionsModel, q, { name: 1 }, p);
  }

  currencies(p: PaginationQueryDto) {
    return this.page(this.currenciesModel, {}, { _id: 1 }, p);
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
