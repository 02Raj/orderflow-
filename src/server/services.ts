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
  orderflowDb?: DatabaseService;
  orderflowDbReady?: Promise<DatabaseService>;
  orderflowServices?: Services;
};

async function getDb(): Promise<DatabaseService> {
  if (globalForServices.orderflowDb) {
    return globalForServices.orderflowDb;
  }
  if (!globalForServices.orderflowDbReady) {
    globalForServices.orderflowDbReady = (async () => {
      const db = new DatabaseService();
      await db.init();
      await new SeedService(db).ensureDemoVenue();
      globalForServices.orderflowDb = db;
      return db;
    })().catch((err) => {
      globalForServices.orderflowDbReady = undefined;
      throw err;
    });
  }
  return globalForServices.orderflowDbReady;
}

export async function getServices(): Promise<Services> {
  if (process.env.NODE_ENV === 'production' && globalForServices.orderflowServices) {
    return globalForServices.orderflowServices;
  }
  const db = await getDb();
  const audit = new AuditService(db);
  const jwt = new Jwt();
  const auth = new AuthService(db, jwt, audit);
  const restaurants = new RestaurantsService(db, audit);
  const menu = new MenuService(db, audit);
  const tables = new TablesService(db, audit);
  const orders = new OrdersService(db, audit, restaurants);
  const reports = new ReportsService(db, restaurants);
  const billing = new BillingService(db, audit);
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
  if (process.env.NODE_ENV === 'production') {
    globalForServices.orderflowServices = services;
  }
  return services;
}
