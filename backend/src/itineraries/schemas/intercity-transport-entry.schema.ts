import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
export class IntercityTransportEntry {
  // ITN-16 specifies a mode field but does not define a finite set of modes.
  @Prop({ required: true, trim: true })
  mode: string;

  @Prop({ required: true, trim: true })
  fromCityId: string;

  @Prop({ required: true, trim: true })
  toCityId: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({
    required: true,
    uppercase: true,
    trim: true,
    minlength: 3,
    maxlength: 3,
    match: /^[A-Z]{3}$/,
  })
  currency: string;
}

export const IntercityTransportEntrySchema =
  SchemaFactory.createForClass(IntercityTransportEntry);
