export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  role: string;
}

export interface HotelPolicy {
  checkInTime: string;
  checkOutTime: string;
  cancellationTiers: Array<{
    daysBeforeCheckIn: number;
    refundPercent: number;
  }>;
}

export interface HotelRoom {
  _id: string;
  name: string;
  type: string;
  bedCount: number;
  maxOccupancy: number;
  pricePerNight: number;
  currency: string;
  amenities: string[];
  totalStayPrice?: number;
}

export interface HotelReview {
  _id: string;
  userId: string;
  bookingId: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

export interface Hotel {
  _id: string;
  name: string;
  city: string;
  country: string;
  address: string;
  description: string;
  starRating: number;
  amenities: string[];
  photos: string[];
  averageReviewRating: number;
  reviewCount: number;
  policy: HotelPolicy;
  rooms?: HotelRoom[];
  reviews?: HotelReview[];
  availableRoomCount?: number;
  lowestPricePerNight?: number;
  currency?: string;
  selectedRooms?: string[];
}

export interface PageResult<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

export interface HotelBooking {
  _id: string;
  hotelId: string | (Pick<Hotel, '_id' | 'name' | 'city' | 'country'> & { _id: string });
  rooms: Array<{
    roomId: string;
    roomName: string;
    adults: number;
    childrenAges: number[];
    pricePerNight: number;
    currency: string;
  }>;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalAmount: number;
  currency: string;
  policySnapshot: HotelPolicy;
  status: string;
  holdExpiresAt: string;
  reference?: string;
  paymentId?: string;
  refundId?: string;
}

export interface HotelBookingGroups {
  upcoming: PageResult<HotelBooking>;
  past: PageResult<HotelBooking>;
  cancelled: PageResult<HotelBooking>;
}

export interface PaymentStart {
  paymentId: string;
  clientSecret: string;
}

export function hotelIdOf(booking: HotelBooking): string {
  return typeof booking.hotelId === 'string'
    ? booking.hotelId
    : booking.hotelId._id;
}

export function hotelNameOf(booking: HotelBooking): string {
  return typeof booking.hotelId === 'string'
    ? 'Hotel reservation'
    : booking.hotelId.name;
}

export function safeImageUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}
