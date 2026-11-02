import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isObjectIdOrHexString } from 'mongoose';

/** Use on :id params: @Param('id', ParseObjectIdPipe) id: string */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    // strict 24-hex check (isValidObjectId also accepts any 12-character string)
    if (!isObjectIdOrHexString(value)) throw new BadRequestException(`Invalid id: ${value}`);
    return value;
  }
}
