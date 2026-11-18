import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'distinctCityPair', async: false })
export class DistinctCityPairValidator implements ValidatorConstraintInterface {
  validate(toCityId: unknown, args: ValidationArguments) {
    const { fromCityId } = args.object as { fromCityId?: unknown };
    return typeof fromCityId !== 'string' ||
      typeof toCityId !== 'string' ||
      fromCityId !== toCityId;
  }

  defaultMessage() {
    return 'fromCityId and toCityId must be different cities';
  }
}
