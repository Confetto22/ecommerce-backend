import { Exclude } from 'class-transformer';
import type { GenderType, Role } from 'generated/prisma/enums';

import { Session } from './session.entity';

/**
 * API representation of a User. Mirrors the Prisma `User` model exactly.
 * Sensitive fields are decorated with `@Exclude()`; pair this with
 * `ClassSerializerInterceptor` (or do an explicit `instanceToPlain` in
 * controllers) to keep them out of responses.
 */
export class User {
  id: string;
  username: string;
  email: string;
  role: Role;
  gender: GenderType;
  city: string;
  country: string;
  createdAt: Date;
  updatedAt: Date;

  @Exclude()
  password?: string;

  @Exclude()
  sessions?: Session[];

  @Exclude()
  tokens?: unknown[];

  constructor(partial: Partial<User>) {
    Object.assign(this, partial);
  }
}
