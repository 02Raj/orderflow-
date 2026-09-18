import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { MenuService } from './menu.service';
import { CurrentUser, assertRole } from '../auth/public.decorator';
import { AuthenticatedUser } from '../common/types';

class CreateCategoryDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsInt() sortOrder?: number;
}

class CreateItemDto {
  @IsString() @MinLength(1) name: string;
  @IsInt() @Min(0) priceMinor: number;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() sortOrder?: number;
}

class UpdateItemDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() @Min(0) priceMinor?: number;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isAvailable?: boolean;
  @IsOptional() @IsString() unavailableReason?: string;
  @IsOptional() @IsInt() sortOrder?: number;
}

class ImportMenuDto {
  @IsString() @MinLength(1) text: string;
  @IsOptional() @IsBoolean() replace?: boolean;
}

class ModifierDto {
  @IsString() @MinLength(1) name: string;
  @IsInt() priceAdjustmentMinor: number;
}

@Controller('menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.menu.getMenu(user.restaurantId);
  }

  @Post('categories')
  createCategory(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCategoryDto) {
    assertRole(user, 'manager');
    return this.menu.createCategory(user, dto.name, dto.sortOrder ?? 0);
  }

  @Delete('categories/:id')
  archiveCategory(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    assertRole(user, 'manager');
    return this.menu.archiveCategory(user, id);
  }

  @Post('items')
  createItem(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateItemDto) {
    assertRole(user, 'manager');
    return this.menu.createItem(user, dto);
  }

  @Post('items/:id/modifiers')
  addModifier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ModifierDto,
  ) {
    assertRole(user, 'manager');
    return this.menu.addModifier(user, id, dto);
  }

  @Patch('items/:id')
  updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
  ) {
    const changesBeyondAvailability = Object.keys(dto).some(
      (key) => !['isAvailable', 'unavailableReason'].includes(key),
    );
    if (changesBeyondAvailability) assertRole(user, 'manager');
    return this.menu.updateItem(user, id, dto);
  }

  @Delete('items/:id')
  archiveItem(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    assertRole(user, 'manager');
    return this.menu.archiveItem(user, id);
  }

  @Post('import')
  importMenu(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportMenuDto) {
    assertRole(user, 'manager');
    return this.menu.importFromText(user, dto.text, dto.replace ?? false);
  }
}
