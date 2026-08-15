import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
    }>();
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!this.auth.verify(token)) {
      throw new UnauthorizedException('Unauthorized');
    }
    return true;
  }
}
