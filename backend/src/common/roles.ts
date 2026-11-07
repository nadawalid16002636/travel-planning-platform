export enum Role {
  USER = 'user',
  ADMIN = 'admin',
  AIRLINE_MOD = 'airline_moderator',
  HOTEL_MOD = 'hotel_moderator',
}

/** What @CurrentUser() returns. */
export interface JwtUser {
  sub: string; // user id
  role: Role;
  providerId?: string; // assigned airline or hotel id, moderators only
  sid?: string; // session id (ACC-06)
}

/** ACC-19: both tokens live only in httpOnly cookies. */
export const AUTH_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
