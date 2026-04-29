import { SetMetadata } from '@nestjs/common';
import type { $Enums } from 'generated/prisma/browser';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: $Enums.Role[]) => SetMetadata(ROLES_KEY, roles);
