import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Airport, Attraction, City, Country, Currency } from './schemas/reference.schemas.js';

type Row = Record<string, string>;

/** Minimal CSV parser (handles quoted fields with commas and "" escapes). */
export function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let field = '', row: string[] = [], quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  const [header, ...data] = rows;
  const keys = (header ?? []).map((h) => h.trim().toLowerCase());
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

export interface SeedReport {
  countries: number;
  cities: number;
  airports: number;
  attractions: number;
  currencies: number;
  warnings: string[];
}

/**
 * GEN-12: loads the official reference datasets from backend/seed-data/*.csv.
 * Idempotent: records are upserted by their original id, so it is safe to run on every start.
 * To use a newer dataset, replace the CSV files (same column names) and restart / npm run seed.
 */
@Injectable()
export class ReferenceSeeder {
  private readonly logger = new Logger('ReferenceSeeder');

  constructor(
    @InjectModel(Country.name) private readonly countries: Model<Country>,
    @InjectModel(City.name) private readonly cities: Model<City>,
    @InjectModel(Airport.name) private readonly airports: Model<Airport>,
    @InjectModel(Attraction.name) private readonly attractions: Model<Attraction>,
    @InjectModel(Currency.name) private readonly currencies: Model<Currency>,
    private readonly config: ConfigService,
  ) {}

  private read(file: string): Row[] {
    const dir = resolve(this.config.get<string>('SEED_DATA_DIR') ?? join(process.cwd(), 'seed-data'));
    const path = join(dir, file);
    if (!existsSync(path)) throw new Error(`Reference dataset not found: ${path}`);
    return parseCsv(readFileSync(path, 'utf8'));
  }

  private async upsert<T>(model: Model<T>, docs: Array<Record<string, unknown> & { _id: string }>) {
    if (!docs.length) return 0;
    await model.bulkWrite(
      docs.map(({ _id, ...rest }) => ({
        updateOne: { filter: { _id } as any, update: { $set: rest } as any, upsert: true },
      })),
    );
    return docs.length;
  }

  async run(): Promise<SeedReport> {
    const warnings: string[] = [];
    const req = (row: Row, key: string, file: string) => {
      if (!row[key]) warnings.push(`${file}: row missing "${key}" -> ${JSON.stringify(row)}`);
      return row[key];
    };

    const countryRows = this.read('countries.csv').filter((r) => req(r, 'code', 'countries.csv'));
    const countryDocs = countryRows.map((r) => ({
      _id: r.code.toUpperCase(),
      name: r.name,
      currency: (r.currency || '').toUpperCase(),
    }));
    const countryIds = new Set(countryDocs.map((c) => c._id));

    const cityDocs = this.read('cities.csv')
      .filter((r) => req(r, 'city_id', 'cities.csv'))
      .map((r) => ({ _id: r.city_id, name: r.name, countryCode: r.country_code.toUpperCase() }));
    const cityIds = new Set(cityDocs.map((c) => c._id));

    const airportDocs = this.read('airports.csv')
      .filter((r) => req(r, 'iata_code', 'airports.csv'))
      .map((r) => ({
        _id: r.iata_code.toUpperCase(),
        name: r.name,
        cityId: r.city_id,
        countryCode: r.country_code.toUpperCase(),
        timeZone: r.time_zone,
      }));

    const attractionDocs = this.read('attractions.csv')
      .filter((r) => req(r, 'attraction_id', 'attractions.csv'))
      .map((r) => ({ _id: r.attraction_id, name: r.name, cityId: r.city_id }));

    // referential checks: report problems, never silently drop rows
    for (const c of cityDocs) if (!countryIds.has(c.countryCode)) warnings.push(`city ${c._id}: unknown country ${c.countryCode}`);
    for (const a of airportDocs) {
      if (!cityIds.has(a.cityId)) warnings.push(`airport ${a._id}: unknown city ${a.cityId}`);
      if (!countryIds.has(a.countryCode)) warnings.push(`airport ${a._id}: unknown country ${a.countryCode}`);
      try { new Intl.DateTimeFormat('en', { timeZone: a.timeZone }); }
      catch { warnings.push(`airport ${a._id}: invalid time zone ${a.timeZone}`); }
    }
    for (const a of attractionDocs) if (!cityIds.has(a.cityId)) warnings.push(`attraction ${a._id}: unknown city ${a.cityId}`);

    const currencyMap = new Map<string, string[]>([['USD', []]]);
    for (const c of countryDocs) {
      if (!c.currency) continue;
      currencyMap.set(c.currency, [...(currencyMap.get(c.currency) ?? []), c._id]);
    }
    const currencyDocs = [...currencyMap].map(([code, countries]) => ({ _id: code, countries }));

    const report: SeedReport = {
      countries: await this.upsert(this.countries, countryDocs),
      cities: await this.upsert(this.cities, cityDocs),
      airports: await this.upsert(this.airports, airportDocs),
      attractions: await this.upsert(this.attractions, attractionDocs),
      currencies: await this.upsert(this.currencies, currencyDocs),
      warnings,
    };
    this.logger.log(
      `Reference data: ${report.countries} countries, ${report.cities} cities, ${report.airports} airports, ` +
        `${report.attractions} attractions, ${report.currencies} currencies`,
    );
    warnings.forEach((w) => this.logger.warn(w));
    return report;
  }
}
