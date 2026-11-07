import { Schema } from 'mongoose';

export const AirportSchema = new Schema(
  {
    officialId: { type: String, required: true, unique: true },
    code: { type: String, required: true, unique: true, match: /^[A-Z]{3}$/ },
    name: { type: String, required: true },
    city: { type: String, required: true },
    country: { type: String, required: true },
    timeZone: { type: String, required: true },
    cityId: String,
    countryCode: String,
  },
  { timestamps: true },
);
const cabin = new Schema({
  cabinClass: {
    type: String,
    required: true,
    enum: ['economy', 'premium-economy', 'business', 'first'],
  },
  capacity: { type: Number, required: true, min: 1 },
  freeBags: { type: Number, required: true, min: 0 },
  maxWeightKgPerBag: { type: Number, required: true, min: 1 },
  reserved: { type: Number, required: true, default: 0, min: 0 },
  priceMinor: { type: Number, required: true, min: 1 },
  currency: { type: String, required: true, match: /^[A-Z]{3}$/ },
});
export const FlightSchema = new Schema(
  {
    flightNumber: { type: String, required: true },
    airlineId: {
      type: Schema.Types.ObjectId,
      ref: 'Airline',
      required: true,
      index: true,
    },
    departureAirport: { type: String, required: true },
    arrivalAirport: { type: String, required: true },
    departureTimeZone: { type: String, required: true },
    arrivalTimeZone: { type: String, required: true },
    departureLocalDate: { type: String, required: true },
    departureAt: { type: Date, required: true, index: true },
    arrivalAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['scheduled', 'cancelled', 'departed'],
      default: 'scheduled',
    },
    cabins: { type: [cabin], required: true },
    policySnapshot: { type: Schema.Types.Mixed, required: true },
    revision: { type: Number, default: 0 },
  },
  { timestamps: true },
);
FlightSchema.index(
  { airlineId: 1, flightNumber: 1, departureLocalDate: 1 },
  { unique: true },
);
FlightSchema.index({
  departureAirport: 1,
  arrivalAirport: 1,
  departureAt: 1,
  status: 1,
});
const leg = new Schema(
  {
    flightId: { type: Schema.Types.ObjectId, ref: 'Flight', required: true },
    cabinClass: { type: String, required: true },
    priceMinor: { type: Number, required: true },
    currency: { type: String, required: true },
    policySnapshot: Schema.Types.Mixed,
    departureAt: Date,
    arrivalAt: Date,
    departureAirport: String,
    arrivalAirport: String,
    departureTimeZone: String,
    arrivalTimeZone: String,
    flightNumber: String,
    freeBags: Number,
    maxWeightKgPerBag: Number,
  },
  { _id: false },
);
export const HoldSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    legs: { type: [leg], required: true },
    seats: { type: Number, required: true, min: 1 },
    state: {
      type: String,
      enum: ['active', 'consumed', 'released'],
      default: 'active',
    },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
); // No TTL: release inventory transactionally before retaining the audit record.
export const BookingSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    holdId: {
      type: Schema.Types.ObjectId,
      ref: 'SeatHold',
      unique: true,
      required: true,
    },
    legs: { type: [leg], required: true },
    seats: { type: Number, required: true },
    passengers: [
      {
        name: String,
        type: { type: String },
        dateOfBirth: String,
        documentNumber: String,
        extraBagWeightsKg: [Number],
      },
    ],
    contactEmail: { type: String, required: true },
    acceptedPoliciesAt: { type: Date, required: true },
    fareMinor: { type: Number, required: true },
    baggageMinor: { type: Number, required: true },
    totalMinor: { type: Number, required: true },
    currency: { type: String, required: true },
    paymentExpiresAt: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: [
        'pending-payment',
        'confirmed',
        'completed',
        'cancelled',
        'expired',
      ],
      default: 'pending-payment',
    },
    paymentId: String,
    lastPaymentOutcome: String,
    refundDueMinor: { type: Number, default: 0 },
    refundState: {
      type: String,
      enum: ['none', 'requested', 'completed', 'failed'],
      default: 'none',
    },
    history: [{ _id: false, at: Date, event: String }],
  },
  { timestamps: true },
);
BookingSchema.index(
  { paymentId: 1 },
  { unique: true, partialFilterExpression: { paymentId: { $type: 'string' } } },
);

export const P2EventSchema = new Schema(
  {
    kind: { type: String, required: true, index: true },
    userId: String,
    bookingId: { type: Schema.Types.ObjectId, ref: 'FlightBooking' },
    payload: { type: Schema.Types.Mixed, required: true },
    deliveredAt: Date,
  },
  { timestamps: true },
);
