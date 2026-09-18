import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from './database/database.service';
import { Public } from './auth/public.decorator';

@Controller()
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Public()
  @Get('health')
  async health() {
    const started = Date.now();
    await this.db.query('select 1');
    return {
      status: 'ok',
      database: this.db.mode,
      latencyMs: Date.now() - started,
      paymentsMode: process.env.STRIPE_SECRET_KEY ? 'stripe' : 'mock',
      trialDays: Number(process.env.TRIAL_DAYS ?? 45),
    };
  }
}
