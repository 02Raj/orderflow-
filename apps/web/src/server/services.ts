import { AuditService } from './audit/audit.service';
import { AuthService } from './auth/auth.service';
import { BillingService } from './billing/billing.service';
import { DatabaseService } from './database/database.service';
import { SeedService } from './database/seed.service';
import { Jwt } from './jwt';
import { MenuService } from './menu/menu.service';
import { OrdersService } from './orders/orders.service';
import { ReportsService } from './reports/reports.service';
import { RestaurantsService } from './restaurants/restaurants.service';
import { TablesService } from './tables/tables.service';

export interface Services {
  db: DatabaseService;
  audit: AuditService;
  auth: AuthService;
  billing: BillingService;
  menu: MenuService;
  orders: OrdersService;
  reports: ReportsService;
  restaurants: RestaurantsService;
  tables: TablesService;
}

const globalForServices = globalThis as typeof globalThis & {
  orderflowServices?: Services;
  orderflowReady?: Promise<Services>;
};

export function getServices(): Promise<Services> {
  if (globalForServices.orderflowServices) {
    return Promise.resolve(globalForServices.orderflowServices);
  }
  if (!globalForServices.orderflowReady) {
    globalForServices.orderflowReady = bootstrap();
  }
  return globalForServices.orderflowReady;
}

async function bootstrap(): Promise<Services> {
  const db = new DatabaseService();
  await db.init();
  const audit = new AuditService(db);
  const jwt = new Jwt();
  const auth = new AuthService(db, jwt, audit);
  const restaurants = new RestaurantsService(db, audit);
  const menu = new MenuService(db, audit);
  const tables = new TablesService(db, audit);
  const orders = new OrdersService(db, audit, restaurants);
  const reports = new ReportsService(db, restaurants);
  const billing = new BillingService(db, audit);
  await new SeedService(db).ensureDemoVenue();
  const services: Services = {
    db,
    audit,
    auth,
    billing,
    menu,
    orders,
    reports,
    restaurants,
    tables,
  };
  globalForServices.orderflowServices = services;
  return services;
}
