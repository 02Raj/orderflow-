import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from './database.service';

const DEMO_EMAIL = 'owner@harbourandrye.demo';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly db: DatabaseService) {}

  async ensureDemoVenue(): Promise<void> {
    const existing = await this.db.one('select id from users where email = $1', [DEMO_EMAIL]);
    if (existing) return;

    const restaurantId = randomUUID();
    const ownerId = randomUUID();
    const trialEndsAt = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();

    await this.db.query(
      `insert into restaurants (id, name, slug, country_code, currency, locale, timezone,
                                tax_label, tax_rate_bp, tax_inclusive, phone, address)
       values ($1, $2, $3, 'GB', 'GBP', 'en-GB', 'Europe/London', 'VAT', 2000, true, $4, $5)`,
      [
        restaurantId,
        'Harbour & Rye',
        'harbour-and-rye',
        '+44 20 7946 0128',
        '14 Dock Lane, Brighton',
      ],
    );

    await this.db.query(
      `insert into users (id, restaurant_id, email, password_hash, full_name, role)
       values ($1, $2, $3, $4, 'Maya Chen', 'owner')`,
      [ownerId, restaurantId, DEMO_EMAIL, await bcrypt.hash('harbour-demo', 10)],
    );

    await this.db.query(
      `insert into users (id, restaurant_id, email, password_hash, full_name, role, staff_pin)
       values ($1, $2, $3, $4, 'Kitchen', 'kitchen', '1234')`,
      [randomUUID(), restaurantId, 'kitchen@harbourandrye.demo', await bcrypt.hash('harbour-demo', 10)],
    );

    await this.db.query(
      `insert into subscriptions (id, restaurant_id, status, plan, trial_ends_at)
       values ($1, $2, 'trialing', 'starter', $3)`,
      [randomUUID(), restaurantId, trialEndsAt],
    );

    for (let n = 1; n <= 8; n++) {
      await this.db.query(
        `insert into dining_tables (id, restaurant_id, table_number, label, qr_token)
         values ($1, $2, $3, $4, $5)`,
        [randomUUID(), restaurantId, n, n <= 2 ? `Window ${n}` : null, randomUUID()],
      );
    }

    const categories: { name: string; items: ItemSeed[] }[] = [
      {
        name: 'Small plates',
        items: [
          {
            name: 'Whipped feta, chilli honey',
            price: 850,
            description: 'Warm flatbread, toasted seeds',
            mods: [
              { name: 'Extra honey', adj: 100 },
              { name: 'Gluten-free bread', adj: 150 },
            ],
          },
          {
            name: 'Crispy squid',
            price: 950,
            description: 'Lemon, smoked paprika aioli',
            mods: [{ name: 'No aioli', adj: 0 }],
          },
        ],
      },
      {
        name: 'Mains',
        items: [
          {
            name: 'Harbour fish pie',
            price: 1650,
            description: 'Cod, smoked haddock, cheddar mash',
            mods: [
              { name: 'Extra greens', adj: 250 },
              { name: 'No cheese crust', adj: 0 },
            ],
          },
          {
            name: 'Rye-crusted chicken',
            price: 1750,
            description: 'Charred hispi, mustard cream',
            mods: [{ name: 'Extra sauce', adj: 150 }],
          },
          {
            name: 'Charred cauliflower',
            price: 1450,
            description: 'Tahini, pomegranate, herbs',
            mods: [{ name: 'Add halloumi', adj: 300 }],
          },
        ],
      },
      {
        name: 'Puddings',
        items: [
          {
            name: 'Sticky toffee, sea salt',
            price: 750,
            description: 'Clotted cream',
            mods: [{ name: 'Extra cream', adj: 100 }],
          },
        ],
      },
      {
        name: 'Drinks',
        items: [
          { name: 'House lemonade', price: 350, description: 'Mint, soda', mods: [] },
          { name: 'Flat white', price: 350, description: 'Double shot', mods: [{ name: 'Oat milk', adj: 40 }] },
        ],
      },
    ];

    let catSort = 0;
    for (const cat of categories) {
      const categoryId = randomUUID();
      await this.db.query(
        'insert into menu_categories (id, restaurant_id, name, sort_order) values ($1, $2, $3, $4)',
        [categoryId, restaurantId, cat.name, catSort++],
      );
      let itemSort = 0;
      for (const item of cat.items) {
        const itemId = randomUUID();
        await this.db.query(
          `insert into menu_items (id, restaurant_id, category_id, name, description, price_minor, sort_order)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [itemId, restaurantId, categoryId, item.name, item.description, item.price, itemSort++],
        );
        for (const mod of item.mods) {
          await this.db.query(
            `insert into menu_modifiers (id, restaurant_id, menu_item_id, name, price_adjustment_minor)
             values ($1, $2, $3, $4, $5)`,
            [randomUUID(), restaurantId, itemId, mod.name, mod.adj],
          );
        }
      }
    }

    this.logger.log('Seeded Harbour & Rye demo venue (owner@harbourandrye.demo / harbour-demo)');
  }
}

interface ItemSeed {
  name: string;
  price: number;
  description: string;
  mods: { name: string; adj: number }[];
}
