import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

/**
 * Every error leaves with a stable shape and a reference id. Staff read the id to support, and
 * internals never reach a customer-facing tablet.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const reference = randomUUID().slice(0, 8);

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const body = typeof payload === 'string' ? { message: payload } : (payload as object);
      if (status >= 500) {
        this.logger.error(`[${reference}] ${request.method} ${request.url}`, exception.stack);
      }
      response.status(status).json({ statusCode: status, reference, ...body });
      return;
    }

    this.logger.error(
      `[${reference}] ${request.method} ${request.url}`,
      (exception as Error)?.stack ?? String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      reference,
      message: 'Something went wrong. Quote reference ' + reference + ' to support.',
    });
  }
}
