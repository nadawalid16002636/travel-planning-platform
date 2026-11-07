import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * GEN-12 reference data. The _id of every record is its ORIGINAL identifier from the official
 * datasets (country code, city_id, IATA code, attraction_id), because evaluation uses the same ids.
 * Other modules store these strings, e.g. flight.departureAirport = 'CAI', hotel.cityId = 'cairo'.
 */

@Schema({ collection: 'countries', versionKey: false })
export class Country {
  @Prop({ type: String }) _id: string; // ISO code, e.g. 'EG'
  @Prop({ required: true }) name: string;
  @Prop({ required: true, uppercase: true }) currency: string; // e.g. 'EGP'
}
export const CountrySchema = SchemaFactory.createForClass(Country);

@Schema({ collection: 'cities', versionKey: false })
export class City {
  @Prop({ type: String }) _id: string; // city_id, e.g. 'cairo'
  @Prop({ required: true }) name: string;
  @Prop({ required: true, index: true }) countryCode: string;
}
export const CitySchema = SchemaFactory.createForClass(City);

@Schema({ collection: 'airports', versionKey: false })
export class Airport {
  @Prop() officialId?: string;
  @Prop() code?: string;
  @Prop() city?: string;
  @Prop() country?: string;
  @Prop({ type: String }) _id: string; // IATA code, e.g. 'CAI'
  @Prop({ required: true }) name: string;
  @Prop({ required: true, index: true }) cityId: string;
  @Prop({ required: true, index: true }) countryCode: string;
  @Prop({ required: true }) timeZone: string; // IANA zone, e.g. 'Africa/Cairo' (GEN-06)
}
export const AirportSchema = SchemaFactory.createForClass(Airport);

@Schema({ collection: 'attractions', versionKey: false })
export class Attraction {
  @Prop({ type: String }) _id: string; // attraction_id, e.g. 'att-1'
  @Prop({ required: true }) name: string;
  @Prop({ required: true, index: true }) cityId: string;
}
export const AttractionSchema = SchemaFactory.createForClass(Attraction);

/** Supported currencies = every currency used by a seeded country (plus USD as the default). */
@Schema({ collection: 'currencies', versionKey: false })
export class Currency {
  @Prop({ type: String }) _id: string; // ISO 4217, e.g. 'EGP'
  @Prop({ type: [String], default: [] }) countries: string[];
}
export const CurrencySchema = SchemaFactory.createForClass(Currency);
