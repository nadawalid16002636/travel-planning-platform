import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Airport } from '../reference/schemas/reference.schemas.js';
import { AirportQueryDto } from './dto.js';

export interface AirportReference {
  officialId: string;
  code: string;
  name: string;
  city: string;
  country: string;
  timeZone: string;
  cityId?: string;
  countryCode?: string;
}
@Injectable()
export class AirportsService {
  constructor(@InjectModel('Airport') private readonly airports: Model<Airport>) {}
  async find(query: AirportQueryDto) {
    const filter: Record<string, any> = {
      ...(query.code ? { _id: query.code } : {}),
      ...(query.city ? { $or: [{ city: query.city }, { cityId: query.city }] } : {}),
    };
    if (query.country) filter.countryCode = query.country.toUpperCase();
    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$and = [{ $or: [{ _id: query.search.toUpperCase() }, { name: new RegExp(escaped, 'i') }] }];
    }
    const [items, total] = await Promise.all([
      this.airports
        .find(filter)
        .sort({ _id: 1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      this.airports.countDocuments(filter),
    ]);
    const data = items.map((item) => this.normalize(item));
    return { data, items: data, total, page: query.page, limit: query.limit };
  }
  async byCode(code: string): Promise<AirportReference> {
    if (!/^[A-Z]{3}$/.test(code))
      throw new BadRequestException('Invalid airport code');
    const airport = await this.airports.findById(code).lean();
    if (!airport)
      throw new BadRequestException(
        'Airport absent from official reference data',
      );
    return this.normalize(airport);
  }
  private normalize(airport: any): AirportReference {
    return { ...airport, code: String(airport._id), officialId: airport.officialId ?? String(airport._id), city: airport.city ?? airport.cityId, country: airport.country ?? airport.countryCode };
  }
  /** Accept only an explicit mapping of the university data; no bundled substitute dataset. */
  async importReference(rows: AirportReference[]) {
    if (!Array.isArray(rows) || !rows.length)
      throw new BadRequestException('Airport reference rows required');
    const codes = new Set<string>();
    const ids = new Set<string>();
    for (const row of rows) {
      if (
        !row ||
        !(['officialId', 'code', 'name', 'city', 'country', 'timeZone'] as const).every(
          (k) => typeof row[k] === 'string' && row[k].trim(),
        ) ||
        !/^[A-Z]{3}$/.test(row.code)
      ) {
        throw new BadRequestException('Invalid official airport reference row');
      }
      try {
        new Intl.DateTimeFormat('en', { timeZone: row.timeZone }).format();
      } catch {
        throw new BadRequestException('Invalid IANA airport time zone');
      }
      if (codes.has(row.code) || ids.has(row.officialId))
        throw new BadRequestException('Duplicate airport reference identifier');
      codes.add(row.code);
      ids.add(row.officialId);
    }
    await this.airports.init();
    // Only set-on-insert: reruns never overwrite existing official identifiers or team records.
    return this.airports.bulkWrite(
      rows.map((row) => ({
        updateOne: {
          filter: { _id: row.code },
          update: { $setOnInsert: { ...row, _id: row.code, cityId: row.cityId ?? row.city, countryCode: row.countryCode ?? row.country } },
          upsert: true,
        },
      })),
      { ordered: true },
    );
  }
}
