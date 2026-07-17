import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

@Injectable()
export class InternalTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['x-internal-token'];
    const provided = Array.isArray(header) ? header[0] : (header ?? '');
    const expected = process.env.INTERNAL_TOKEN ?? '';

    const providedBuf = Buffer.from(provided, 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const match =
      expected.length > 0 &&
      providedBuf.length === expectedBuf.length &&
      timingSafeEqual(providedBuf, expectedBuf);

    if (!match) {
      throw new UnauthorizedException({
        code: 'unauthorized',
        message: 'Invalid internal token',
      });
    }
    return true;
  }
}
