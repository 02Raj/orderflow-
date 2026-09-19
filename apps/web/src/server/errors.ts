export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class BadRequestException extends HttpError {
  constructor(message: string) {
    super(400, message);
  }
}

export class UnauthorizedException extends HttpError {
  constructor(message: string) {
    super(401, message);
  }
}

export class ForbiddenException extends HttpError {
  constructor(message: string) {
    super(403, message);
  }
}

export class NotFoundException extends HttpError {
  constructor(message: string) {
    super(404, message);
  }
}

export class RateLimitedException extends HttpError {
  constructor(message = 'Too many attempts. Wait a minute and try again.') {
    super(429, message, { error: 'rate_limited' });
  }
}

export class PaymentRequiredException extends HttpError {
  constructor(message = 'Your free trial has ended. Subscribe to keep taking orders.') {
    super(402, message, { error: 'subscription_required' });
  }
}
