import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import { OrdersService } from './orders.service';
import { CurrentUser, assertRole } from '../auth/public.decorator';
import { AuthenticatedUser, OrderStatus } from '../common/types';

class StaffLineDto {
  @IsString() menuItemId: string;
  @IsInt() @Min(1) quantity: number;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) modifierIds?: string[];
}

class StaffOrderDto {
  @IsString() @MinLength(6) clientRef: string;
  @IsString() tableId: string;
  @IsOptional() @IsString() customerLabel?: string;
  @IsOptional() @IsString() note?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => StaffLineDto)
  lines: StaffLineDto[];
}

class StatusDto {
  @IsIn(['accepted', 'preparing', 'ready', 'served', 'cancelled'])
  status: OrderStatus;
  @IsOptional() @IsString() reason?: string;
}

class ItemStatusDto {
  @IsIn(['pending', 'preparing', 'ready'])
  status: 'pending' | 'preparing' | 'ready';
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('businessDate') businessDate?: string,
    @Query('active') active?: string,
  ) {
    return this.orders.list(user.restaurantId, {
      status,
      businessDate,
      activeOnly: active === '1',
    });
  }

  @Get('business-date')
  businessDate(@CurrentUser() user: AuthenticatedUser) {
    return this.orders.currentBusinessDate(user.restaurantId).then((date) => ({ businessDate: date }));
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.findById(user.restaurantId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: StaffOrderDto) {
    assertRole(user, 'staff');
    return this.orders.createStaffOrder(user, { ...dto, restaurantId: user.restaurantId });
  }

  @Patch(':id/status')
  setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StatusDto,
  ) {
    if (dto.status === 'cancelled') assertRole(user, 'staff');
    return this.orders.setStatus(user, id, dto.status, dto.reason);
  }

  @Patch(':id/items/:itemId/status')
  setItemStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: ItemStatusDto,
  ) {
    return this.orders.setItemStatus(user, id, itemId, dto.status);
  }
}
