import { PartialType } from '@nestjs/mapped-types';

import { CreateUserDto } from './create-user.dto';

/**
 * All fields optional. Note this is the *request* shape — controllers should
 * never accept fields like `role` from end users without a guard. Build a
 * narrower DTO at each call site if the surface area should be smaller.
 */
export class UpdateUserDto extends PartialType(CreateUserDto) {}
