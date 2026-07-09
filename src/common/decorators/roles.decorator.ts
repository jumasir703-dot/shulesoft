import { SetMetadata } from '@nestjs/common';
import { SystemRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Usage: @Roles(SystemRole.SCHOOL_ADMIN, SystemRole.SUPER_ADMIN)
 * Combine with RolesGuard (applied globally or per-controller).
 */
export const Roles = (...roles: SystemRole[]) => SetMetadata(ROLES_KEY, roles);
