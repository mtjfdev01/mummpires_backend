import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(private readonly config: ConfigService) {}

  login(username: string, password: string) {
    const expectedUser = this.config.get<string>('ADMIN_USER') || 'admin';
    const expectedPass =
      this.config.get<string>('ADMIN_PASSWORD') || 'mummpires-admin';

    if (
      !this.safeEqual(username, expectedUser) ||
      !this.safeEqual(password, expectedPass)
    ) {
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
