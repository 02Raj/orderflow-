import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class SignupDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;

  @IsString()
  @MinLength(2)
  fullName: string;

  @IsString()
  @MinLength(2)
  restaurantName: string;

  @IsString()
  countryCode: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class CreateStaffDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(2)
  fullName: string;

  @IsIn(['manager', 'staff', 'kitchen'])
  role: 'manager' | 'staff' | 'kitchen';

  @IsOptional()
  @IsString()
  staffPin?: string;
}
