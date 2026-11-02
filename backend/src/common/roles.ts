export enum Role {
  USER = 'user',
  ADMIN = 'admin',
  AIRLINE_MOD = 'airline_moderator',
  HOTEL_MOD = 'hotel_moderator',
}

/** What the JWT carries and what @CurrentUser() returns. */
export interface JwtUser {
  sub: string; // user id
  role: Role;
  providerId?: string; // assigned airline or hotel id, moderators only
}

export const AUTH_COOKIE = 'access_token';
