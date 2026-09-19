import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { OrdersService } from './orders.service';
import { CurrentUser } from '../auth/public.decorator';
import { AuthenticatedUser } from '../common/types';

@Controller('orders')
export class OrdersSseController {
  constructor(private readonly orders: OrdersService) {}

  @Get('stream')
  stream(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

    const channel = `orders:${user.restaurantId}`;
    const onEvent = (payload: { type: string; order: unknown }) => {
      res.write(`event: order:${payload.type}\ndata: ${JSON.stringify(payload.order)}\n\n`);
    };
    this.orders.events.on(channel, onEvent);

    const heartbeat = setInterval(() => {
      res.write(`: ping ${Date.now()}\n\n`);
    }, 15_000);

    const cleanup = () => {
      clearInterval(heartbeat);
      this.orders.events.off(channel, onEvent);
    };
    req.on('close', cleanup);
    req.on('aborted', cleanup);
  }
}
