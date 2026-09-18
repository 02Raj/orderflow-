import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { CurrentUser } from '../auth/public.decorator';
import { AuthenticatedUser } from '../common/types';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('day')
  day(@CurrentUser() user: AuthenticatedUser, @Query('date') date?: string) {
    return this.reports.day(user.restaurantId, date);
  }

  @Get('recent')
  recent(@CurrentUser() user: AuthenticatedUser, @Query('days') days?: string) {
    return this.reports.recent(user.restaurantId, days ? Number(days) : 14);
  }
}
