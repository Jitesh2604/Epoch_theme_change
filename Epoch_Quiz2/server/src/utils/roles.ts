import { Role } from '../lib/enums';

/** Roles that have administrative privileges across the platform. */
export const ADMIN_ROLES = [
  Role.SUPER_ADMIN,
  Role.PUBLICATION_ADMIN,
  Role.CONTENT_MANAGER,
] as const;

export function isAdminRole(role: Role): boolean {
  return (ADMIN_ROLES as readonly Role[]).includes(role);
}
