import { Body, Controller, Get, Patch } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { RestaurantsService } from './restaurants.service';
import { CurrentUser, assertRole } from '../auth/public.decorator';
import { AuthenticatedUser } from '../common/types';
import { AuditService } from '../audit/audit.service';

class UpdateRestaurantDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() locale?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() taxLabel?: string;
  @IsOptional() @IsInt() @Min(0) @Max(5000) taxRateBp?: number;
  @IsOptional() @IsBoolean() taxInclusive?: boolean;
  @IsOptional() @IsString() taxNumber?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
}

@Controller('restaurant')
export class RestaurantsController {
  constructor(
    private readonly restaurants: RestaurantsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.restaurants.findById(user.restaurantId);
  }

  @Patch()
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateRestaurantDto) {
    assertRole(user, 'owner');
    return this.restaurants.update(user, dto);
  }

  @Get('activity')
  activity(@CurrentUser() user: AuthenticatedUser) {
    assertRole(user, 'manager');
    return this.audit.list(user.restaurantId);
  }
}
