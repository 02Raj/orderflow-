import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateStaffDto, LoginDto, SignupDto } from './dto';
import { CurrentUser, Public, assertRole } from './public.decorator';
import { AuthenticatedUser } from '../common/types';
import { Throttle } from '../common/throttle.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Get('country-presets')
  presets() {
    return this.auth.countryPresets();
  }

  @Public()
  @Throttle(5, 60)
  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Public()
  @Throttle(5, 60)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get('staff')
  staff(@CurrentUser() user: AuthenticatedUser) {
    assertRole(user, 'manager');
    return this.auth.listStaff(user.restaurantId);
  }

  @Post('staff')
  createStaff(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStaffDto) {
    assertRole(user, 'owner');
    return this.auth.createStaff(user, dto);
  }
}
