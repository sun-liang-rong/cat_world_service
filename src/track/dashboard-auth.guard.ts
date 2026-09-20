import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DashboardAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const token = (this.config.get<string>('app.dashboardToken') ?? '').trim();
    if (!token) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const header = headerValue(request.headers['x-dashboard-token']);
    const authorization = headerValue(request.headers.authorization);
    const bearer = authorization.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : '';

    if (header === token || bearer === token) {
      return true;
    }
    throw new UnauthorizedException('看板未授权');
  }
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return String(value[0] ?? '').trim();
  }
  return String(value ?? '').trim();
}
