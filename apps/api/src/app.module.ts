import { Global, Logger, Module, OnModuleInit } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { DatabaseService } from './database/database.service';
import { SeedService } from './database/seed.service';
import { AuditService } from './audit/audit.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RestaurantsService } from './restaurants/restaurants.service';
import { RestaurantsController } from './restaurants/restaurants.controller';
import { MenuService } from './menu/menu.service';
import { MenuController } from './menu/menu.controller';
import { TablesService } from './tables/tables.service';
import { TablesController } from './tables/tables.controller';
import { OrdersService } from './orders/orders.service';
import { OrdersSseController } from './orders/orders.sse.controller';
import { OrdersController } from './orders/orders.controller';
import { PublicController } from './public/public.controller';
import { ReportsService } from './reports/reports.service';
import { ReportsController } from './reports/reports.controller';
import { BillingService } from './billing/billing.service';
import { BillingController } from './billing/billing.controller';
import { SubscriptionGuard } from './billing/subscription.guard';
import { ThrottleGuard } from './common/throttle.guard';
import { HealthController } from './health.controller';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule],
  controllers: [
    HealthController,
    RestaurantsController,
    MenuController,
    TablesController,
    OrdersSseController,
    OrdersController,
    PublicController,
    ReportsController,
    BillingController,
  ],
  providers: [
    DatabaseService,
    SeedService,
    AuditService,
    RestaurantsService,
    MenuService,
    TablesService,
    OrdersService,
    ReportsService,
    BillingService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
    { provide: APP_GUARD, useClass: ThrottleGuard },
  ],
  exports: [DatabaseService, AuditService, BillingService, MenuService, TablesService, OrdersService],
})
export class AppModule implements OnModuleInit {
  private readonly logger = new Logger(AppModule.name);

  constructor(private readonly seed: SeedService) {}

  async onModuleInit(): Promise<void> {
    await this.seed.ensureDemoVenue();
    this.logger.log('OrderFlow modules ready');
  }
}
