import { createHmac, timingSafeEqual } from 'crypto';
import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type LoginMeta = {
  ip?: string;
  forwardedFor?: string;
  userAgent?: string;
  origin?: string;
  referer?: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly config: ConfigService) {}

  login(username: string, password: string, meta: LoginMeta = {}) {
    const rawUser = String(username ?? '');
    const rawPass = String(password ?? '');
    const user = rawUser.trim();
    const pass = rawPass.trim();
    const expectedUser = (
      this.config.get<string>('ADMIN_USER') || 'admin'
    ).trim();
    const expectedPass = (
      this.config.get<string>('ADMIN_PASSWORD') || 'mummpires-admin'
    ).trim();

    const userMatch = this.safeEqual(user, expectedUser);
    const passMatch = this.safeEqual(pass, expectedPass);
    const success = userMatch && passMatch;
    const reason = success
      ? 'success'
      : !userMatch && !passMatch
        ? 'wrong_username_and_password'
        : !userMatch
          ? 'wrong_username'
          : 'wrong_password';

    this.logger.log(
      [
        'LOGIN_ATTEMPT',
        `status=${success ? 'success' : 'failure'}`,
        `reason=${reason}`,
        `username=${JSON.stringify(rawUser)}`,
        `password=${JSON.stringify(rawPass)}`,
        `usernameLength=${rawUser.length}`,
        `passwordLength=${rawPass.length}`,
        `usernameTrimmed=${rawUser !== user}`,
        `passwordTrimmed=${rawPass !== pass}`,
        `usernameCodes=${this.charCodes(rawUser)}`,
        `passwordCodes=${this.charCodes(rawPass)}`,
        `expectedUser=${JSON.stringify(expectedUser)}`,
        `envUserSet=${Boolean(this.config.get('ADMIN_USER'))}`,
        `envPassSet=${Boolean(this.config.get('ADMIN_PASSWORD'))}`,
        `ip=${meta.ip || '-'}`,
        `forwardedFor=${meta.forwardedFor || '-'}`,
        `origin=${meta.origin || '-'}`,
        `referer=${meta.referer || '-'}`,
        `userAgent=${JSON.stringify(meta.userAgent || '')}`,
      ].join(' '),
    );

    if (!success) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { token: this.createToken() };
  }

  verify(token: string) {
    const [payload, signature] = String(token || '').split('.');
    if (!payload || !signature) return false;
    const expected = this.sign(payload);
    if (!this.safeEqual(signature, expected)) return false;
    try {
      const data = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as { exp: number };
      return Date.now() < data.exp;
    } catch {
      return false;
    }
  }

  private charCodes(value: string) {
    return [...value].map((char) => char.charCodeAt(0)).join(',') || '(empty)';
  }

  private createToken() {
    const payload = Buffer.from(
      JSON.stringify({ sub: 'admin', exp: Date.now() + 1000 * 60 * 60 * 24 }),
    ).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  private sign(payload: string) {
    const secret =
      this.config.get<string>('ADMIN_SECRET') ||
      this.config.get<string>('ADMIN_PASSWORD') ||
      'mummpires-admin';
    return createHmac('sha256', secret).update(payload).digest('base64url');
  }

  private safeEqual(a: string, b: string) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }
}
