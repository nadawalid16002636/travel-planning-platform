import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PassengerDto } from './dto';

export interface PassengerRules {
  source: string;
  adultMinAge: number;
  childMinAge: number;
  maxPassengers: number;
  maxInfantsPerAdult: number;
  infantOccupiesSeat: boolean;
  childFarePercent: number;
  infantFarePercent: number;
}
@Injectable()
export class P2Rules {
  private rules: PassengerRules = {
    source: 'Official requirements workbook Mandatory!D26 (FLT-12)',
    adultMinAge: 12,
    childMinAge: 2,
    maxPassengers: Number.MAX_SAFE_INTEGER,
    maxInfantsPerAdult: 1,
    infantOccupiesSeat: false,
    childFarePercent: 100,
    infantFarePercent: 10,
  };
  /** Team leader supplies workbook-backed rules through trusted startup integration. */
  configure(rules: PassengerRules) {
    if (
      !rules.source?.trim() ||
      !Number.isInteger(rules.childMinAge) ||
      rules.childMinAge < 0 ||
      !Number.isInteger(rules.adultMinAge) ||
      rules.adultMinAge <= rules.childMinAge ||
      !Number.isInteger(rules.maxPassengers) ||
      rules.maxPassengers < 1 ||
      !Number.isInteger(rules.maxInfantsPerAdult) ||
      rules.maxInfantsPerAdult < 0 ||
      typeof rules.infantOccupiesSeat !== 'boolean' ||
      !Number.isInteger(rules.childFarePercent) ||
      rules.childFarePercent < 0 ||
      !Number.isInteger(rules.infantFarePercent) ||
      rules.infantFarePercent < 0
    ) {
      throw new Error('Invalid workbook passenger rules');
    }
    this.rules = Object.freeze({ ...rules });
  }
  counts(adults: number, children: number, infants: number) {
    const r = this.get();
    if (
      ![adults, children, infants].every(Number.isSafeInteger) ||
      adults < 1 ||
      children < 0 ||
      infants < 0 ||
      adults + children + infants > r.maxPassengers ||
      infants > adults * r.maxInfantsPerAdult
    ) {
      throw new BadRequestException(
        'Passenger counts violate the configured workbook rules',
      );
    }
    return adults + children + (r.infantOccupiesSeat ? infants : 0);
  }
  validateSeatCount(seats: number) {
    if (
      !Number.isSafeInteger(seats) ||
      seats < 1 ||
      seats > this.get().maxPassengers
    )
      throw new BadRequestException('Invalid held seat count');
  }
  fare(passengers: PassengerDto[], priceMinor: number) {
    const r = this.get();
    return passengers.reduce(
      (total, p) =>
        total +
        Math.round(
          (priceMinor *
            (p.type === 'adult'
              ? 100
              : p.type === 'child'
                ? r.childFarePercent
                : r.infantFarePercent)) /
            100,
        ),
      0,
    );
  }
  validate(passengers: PassengerDto[], departure: Date) {
    const r = this.get();
    const counts = { adult: 0, child: 0, infant: 0 };
    const documents = new Set<string>();
    for (const p of passengers) {
      const birth = new Date(p.dateOfBirth + 'T00:00:00Z');
      if (
        !Number.isFinite(birth.getTime()) ||
        birth > departure ||
        birth.toISOString().slice(0, 10) !== p.dateOfBirth
      ) {
        throw new BadRequestException('Invalid passenger birth date');
      }
      let age = departure.getUTCFullYear() - birth.getUTCFullYear();
      if (
        departure.getUTCMonth() < birth.getUTCMonth() ||
        (departure.getUTCMonth() === birth.getUTCMonth() &&
          departure.getUTCDate() < birth.getUTCDate())
      )
        age--;
      const expected =
        age >= r.adultMinAge
          ? 'adult'
          : age >= r.childMinAge
            ? 'child'
            : 'infant';
      if (p.type !== expected)
        throw new BadRequestException(
          'Passenger type does not match age at travel',
        );
      const document = p.documentNumber.trim().toUpperCase();
      if (documents.has(document))
        throw new BadRequestException('Duplicate passenger document');
      documents.add(document);
      counts[p.type]++;
    }
    return this.counts(counts.adult, counts.child, counts.infant);
  }
  private get() {
    if (!this.rules)
      throw new ServiceUnavailableException(
        'Official workbook passenger rules have not been configured',
      );
    return this.rules;
  }
}
