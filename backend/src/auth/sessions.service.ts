import { createHash, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import type { CookieOptions, Request, Response } from 'express';
import { Model, Types } from 'mongoose';
import { AUTH_RULES, durationToMs } from '../common/auth.config.js';
import { AUTH_COOKIE, REFRESH_COOKIE } from '../common/roles.js';
import { Session } from './schemas/session.schema.js';

export interface AccessPayload {
  sub: string;
  sid: string;
  iat?: number;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const IDLE_MS = AUTH_RULES.sessionIdleMinutes * 60_000;
const TOUCH_EVERY_MS = 60_000; // write lastActivityAt at most once a minute

/** ACC-06, ACC-19: access + refresh tokens, 30-minute inactivity expiry, server-side revocation. */
@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(Session.name) private readonly model: Model<Session>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private cookieBase(): CookieOptions {
    return {
      httpOnly: true,
      // Secure cookies still work on http://localhost in modern browsers; set COOKIE_SECURE=false only if needed
      secure: this.config.get('COOKIE_SECURE') !== 'false',
      sameSite: 'lax',
      path: '/',
    };
  }

  private accessTtl() {
    return this.config.get<string>('JWT_EXPIRES_IN') || AUTH_RULES.accessTokenTtl;
  }

  /** Login: creates a session and sets both cookies. */
  async start(userId: string, req: Request, res: Response): Promise<string> {
    const refreshToken = randomBytes(48).toString('base64url');
    const now = new Date();
    const session = await this.model.create({
      userId: new Types.ObjectId(userId),
      refreshTokenHash: hash(refreshToken),
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + AUTH_RULES.sessionMaxDays * 864e5),
      userAgent: req.headers['user-agent']?.slice(0, 200),
      ip: req.ip,
    });
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...this.cookieBase(),
      maxAge: AUTH_RULES.sessionMaxDays * 864e5,
    });
    this.setAccessCookie(res, userId, session.id);
    return session.id;
  }

  setAccessCookie(res: Response, userId: string, sessionId: string) {
    const token = this.jwt.sign({ sub: userId, sid: sessionId } satisfies AccessPayload, {
      expiresIn: this.accessTtl() as any,
    });
    res.cookie(AUTH_COOKIE, token, { ...this.cookieBase(), maxAge: durationToMs(this.accessTtl()) });
  }

  clearCookies(res: Response) {
    const base = this.cookieBase();
    res.clearCookie(AUTH_COOKIE, base);
    res.clearCookie(REFRESH_COOKIE, base);
  }

  /**
   * Used by the AuthGuard on every request. Returns { userId, sessionId } or throws 401.
   * A valid access token is accepted while its session is active; otherwise the refresh token
   * renews the access token. Either way, 30 minutes without requests ends the session.
   */
  async authenticate(req: Request, res: Response): Promise<{ userId: string; sessionId: string } | null> {
    const access = req.cookies?.[AUTH_COOKIE];
    const refresh = req.cookies?.[REFRESH_COOKIE];
    if (!access && !refresh) return null;

    let session: (Session & { _id: Types.ObjectId }) | null = null;
    let renewAccess = false;

    if (access) {
      try {
        const payload = this.jwt.verify<AccessPayload>(access);
        session = await this.model.findById(payload.sid).lean();
      } catch {
        renewAccess = true; // expired or invalid: fall back to the refresh token
      }
    }
    if (!session && refresh) {
      session = await this.model.findOne({ refreshTokenHash: hash(refresh) }).lean();
      renewAccess = true;
    }

    const now = Date.now();
    if (!session || session.revokedAt || session.expiresAt.getTime() < now) {
      this.clearCookies(res);
      throw new UnauthorizedException('Session expired, please log in again');
    }
    if (now - session.lastActivityAt.getTime() > IDLE_MS) {
      await this.model.updateOne({ _id: session._id }, { revokedAt: new Date() });
      this.clearCookies(res);
      throw new UnauthorizedException(
        `Session expired after ${AUTH_RULES.sessionIdleMinutes} minutes of inactivity, please log in again`,
      );
    }
    if (now - session.lastActivityAt.getTime() > TOUCH_EVERY_MS) {
      await this.model.updateOne({ _id: session._id }, { lastActivityAt: new Date(now) });
    }

    const userId = session.userId.toString();
    const sessionId = session._id.toString();
    if (renewAccess) this.setAccessCookie(res, userId, sessionId);
    return { userId, sessionId };
  }

  /** Logout (ACC-06): revoke the current session from whichever cookie is present. */
  async revokeCurrent(req: Request) {
    const refresh = req.cookies?.[REFRESH_COOKIE];
    if (refresh) {
      await this.model.updateOne({ refreshTokenHash: hash(refresh) }, { revokedAt: new Date() });
      return;
    }
    const access = req.cookies?.[AUTH_COOKIE];
    if (access) {
      const payload = this.jwt.decode(access) as AccessPayload | null;
      if (payload?.sid && Types.ObjectId.isValid(payload.sid)) {
        await this.model.updateOne({ _id: payload.sid }, { revokedAt: new Date() });
      }
    }
  }

  /** Password change (keep the current session) and admin reset / suspension (revoke all). */
  async revokeAllForUser(userId: string, exceptSessionId?: string) {
    const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId), revokedAt: { $exists: false } };
    if (exceptSessionId) filter._id = { $ne: new Types.ObjectId(exceptSessionId) };
    await this.model.updateMany(filter, { revokedAt: new Date() });
  }
}
