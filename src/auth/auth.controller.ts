import { Body, Controller, Post, Req } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(
    @Body() body: { username?: string; password?: string },
    @Req()
    req: {
      ip?: string;
      headers: Record<string, string | string[] | undefined>;
    },
  ) {
    const header = (name: string) => {
      const value = req.headers[name];
      return Array.isArray(value) ? value.join(',') : value || '';
    };

    return this.auth.login(body.username || '', body.password || '', {
      ip: req.ip || '',
      forwardedFor: header('x-forwarded-for'),
      userAgent: header('user-agent'),
      origin: header('origin'),
      referer: header('referer'),
    });
  }
}
