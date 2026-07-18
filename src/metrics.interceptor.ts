import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import { catchError, tap, throwError } from 'rxjs';
import { httpRequestDuration } from './metrics';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const start = process.hrtime.bigint();
    const request = context.switchToHttp().getRequest<{ method: string }>();
    const handler = `${context.getClass().name}#${context.getHandler().name}`;

    const observe = (status: number) => {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      httpRequestDuration.observe(
        { method: request.method, handler, status },
        durationSeconds,
      );
    };

    return next.handle().pipe(
      tap(() =>
        observe(context.switchToHttp().getResponse<Response>().statusCode),
      ),
      catchError((err) => {
        observe(err instanceof HttpException ? err.getStatus() : 500);
        return throwError(() => err);
      }),
    );
  }
}
