import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { TablesService } from './tables.service';
import { CurrentUser, assertRole } from '../auth/public.decorator';
import { AuthenticatedUser } from '../common/types';

class CreateTableDto {
  @IsInt() @Min(1) tableNumber: number;
  @IsOptional() @IsString() label?: string;
}

class UpdateTableDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(1) tableNumber?: number;
}

@Controller('tables')
export class TablesController {
  constructor(private readonly tables: TablesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.tables.list(user.restaurantId);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTableDto) {
    assertRole(user, 'manager');
    return this.tables.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateTableDto) {
    assertRole(user, 'manager');
    return this.tables.update(user, id, dto);
  }

  @Post(':id/rotate')
  rotate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    assertRole(user, 'manager');
    return this.tables.rotateToken(user, id);
  }
}
