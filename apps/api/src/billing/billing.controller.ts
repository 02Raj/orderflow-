import { Body, Controller, Get, Headers, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { IsOptional, IsString } from 'class-validator';
import { BillingService } from './billing.service';
import { CurrentUser, Public, assertRole } from '../auth/public.decorator';
import { AuthenticatedUser } from '../common/types';
import { Throttle } from '../common/throttle.guard';

class CheckoutDto {
  @IsOptional() @IsString() successUrl?: string;
  @IsOptional() @IsString() cancelUrl?: string;
}

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.status(user.restaurantId);
  }

  @Throttle(5, 60)
  @Post('checkout')
  checkout(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckoutDto) {
    assertRole(user, 'owner');
    const appUrl = process.env.APP_PUBLIC_URL ?? 'http://127.0.0.1:43123';
    return this.billing.createCheckout(
      user,
      dto.successUrl ?? `${appUrl}/settings?billing=success`,
      dto.cancelUrl ?? `${appUrl}/settings?billing=cancelled`,
    );
  }

  /** Local stand-in for the hosted checkout page while no payment provider is connected. */
  @Public()
  @Get('mock-confirm')
  async mockConfirm(
    @Query('restaurantId') restaurantId: string,
    @Query('redirect') redirect: string,
    @Res() res: Response,
  ) {
    if (this.billing.mockMode && restaurantId) {
      await this.billing.markActive(restaurantId, { provider: 'mock' });
    }
    res.redirect(redirect || '/');
  }

  @Public()
  @Post('webhook/stripe')
  webhook(@Req() request: Request, @Headers('stripe-signature') signature: string) {
    return this.billing.handleStripeEvent(request.body as Buffer, signature);
  }
}
