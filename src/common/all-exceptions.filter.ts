import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

const SLUG_BY_STATUS: Record<number, string> = {
  400: 'validation_failed',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  422: 'unprocessable',
  500: 'internal_error',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        body && typeof body === 'object' && 'message' in body
          ? (body as { message: string | string[] }).message
          : exception.message;
      const code =
        body && typeof body === 'object' && 'code' in body
          ? (body as { code: string }).code
          : (SLUG_BY_STATUS[status] ?? 'error');

      response.status(status).json({ error: { code, message } });
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.message : String(exception),
      exception instanceof Error ? exception.stack : undefined,
    );
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({
        error: { code: 'internal_error', message: 'Internal server error' },
      });
  }
}
