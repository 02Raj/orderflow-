import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import { Public } from '../auth/public.decorator';
import { MenuService } from '../menu/menu.service';
import { TablesService } from '../tables/tables.service';
import { OrdersService } from '../orders/orders.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { BillingService } from '../billing/billing.service';

class GuestLineDto {
  @IsString() menuItemId: string;
  @IsInt() @Min(1) quantity: number;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) modifierIds?: string[];
}

class GuestOrderDto {
  @IsString() @MinLength(6) clientRef: string;
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() note?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => GuestLineDto)
  lines: GuestLineDto[];
}

@Controller('public')
export class PublicController {
  constructor(
    private readonly menu: MenuService,
    private readonly tables: TablesService,
    private readonly orders: OrdersService,
    private readonly restaurants: RestaurantsService,
    private readonly billing: BillingService,
  ) {}

  @Public()
  @Get('venues/:slug/tables/:token')
  async tableMenu(@Param('slug') slug: string, @Param('token') token: string) {
    const table = await this.tables.findByToken(slug, token);
    if (!table) throw new NotFoundException('This QR code is not active');

    const [menu, restaurant, billing] = await Promise.all([
      this.menu.getPublicMenu(table.restaurantId),
      this.restaurants.findById(table.restaurantId),
      this.billing.status(table.restaurantId),
    ]);

    return {
      restaurant: {
        name: restaurant.name,
        slug: restaurant.slug,
        currency: restaurant.currency,
        locale: restaurant.locale,
        taxLabel: restaurant.taxLabel,
        taxInclusive: restaurant.taxInclusive,
      },
      table: {
        id: table.tableId,
        number: table.tableNumber,
        label: table.label,
      },
      orderingEnabled: !billing.accessBlocked,
      menu,
    };
  }

  @Public()
  @Post('venues/:slug/tables/:token/orders')
  async placeOrder(
    @Param('slug') slug: string,
    @Param('token') token: string,
    @Body() dto: GuestOrderDto,
  ) {
    const table = await this.tables.findByToken(slug, token);
    if (!table) throw new NotFoundException('This QR code is not active');

    const billing = await this.billing.status(table.restaurantId);
    if (billing.accessBlocked) {
      throw new BadRequestException('This restaurant is not accepting digital orders right now');
    }

    return this.orders.createGuestOrder({
      restaurantId: table.restaurantId,
      tableId: table.tableId,
      clientRef: dto.clientRef,
      customerLabel: dto.customerName,
      note: dto.note,
      lines: dto.lines,
    });
  }

  @Public()
  @Get('venues/:slug/tables/:token/orders/:orderId')
  async guestOrder(
    @Param('slug') slug: string,
    @Param('token') token: string,
    @Param('orderId') orderId: string,
  ) {
    const table = await this.tables.findByToken(slug, token);
    if (!table) throw new NotFoundException('This QR code is not active');
    const order = await this.orders.findById(table.restaurantId, orderId);
    if (order.tableId !== table.tableId) throw new NotFoundException('Order not found');
    return order;
  }
}
