import { PartialType } from '@nestjs/mapped-types';

import { CreateUserDto } from './create-user.dto';
import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * All fields optional. Note this is the *request* shape — controllers should
 * never accept fields like `role` from end users without a guard. Build a
 * narrower DTO at each call site if the surface area should be smaller.
 */
export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsString()
  @MinLength(3)
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  city: string;

  @IsString()
  country: string;

  @IsString()
  phone: string;

  @IsString()
  timezone: string;

  @IsString()
  photo: string;
}
