import Link from 'next/link';
import { safeImageUrl, type Hotel } from '@/lib/hotel-types';

export function HotelCard({
  hotel,
  search = '',
}: {
  hotel: Hotel;
  search?: string;
}) {
  const image = safeImageUrl(hotel.photos?.[0]);
  const href = `/hotels/${hotel._id}${search ? `?${search}` : ''}`;

  return (
    <article className="hotel-card">
      <Link className="hotel-card-image" href={href} aria-label={`View ${hotel.name}`}>
        {image ? (
          <div className="hotel-image" style={{ backgroundImage: `url("${image}")` }} />
        ) : (
          <div className="hotel-image hotel-image-placeholder">
            <span aria-hidden="true">✦</span>
            <span>{hotel.city}</span>
          </div>
        )}
        <span className="image-tag">{hotel.starRating ?? 0} star stay</span>
        <span className="image-heart" aria-hidden="true">♡</span>
      </Link>
      <div className="hotel-card-body">
        <div className="hotel-card-heading">
          <div>
            <p className="eyebrow">{hotel.city}, {hotel.country}</p>
            <Link href={href}><h3>{hotel.name}</h3></Link>
          </div>
          <span className="rating-badge">
            <span aria-hidden="true">★</span>
            {hotel.averageReviewRating ? hotel.averageReviewRating.toFixed(1) : 'New'}
          </span>
        </div>
        <p className="hotel-card-description">
          {hotel.description || `${hotel.starRating}-star comfort in ${hotel.city}.`}
        </p>
        <div className="hotel-card-bottom">
          <div className="hotel-card-amenities">
            {(hotel.amenities ?? []).slice(0, 3).map((amenity) => (
              <span key={amenity}>{amenity}</span>
            ))}
            {hotel.availableRoomCount !== undefined && (
              <span>{hotel.availableRoomCount} rooms available</span>
            )}
          </div>
          <div className="hotel-price">
            {hotel.lowestPricePerNight !== undefined && (
              <>
                <strong>
                  {new Intl.NumberFormat(undefined, {
                    style: 'currency',
                    currency: hotel.currency ?? 'USD',
                    maximumFractionDigits: 0,
                  }).format(hotel.lowestPricePerNight)}
                </strong>
                <span> / night</span>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
