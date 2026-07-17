import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...keys: string[]) =>
  SetMetadata(PERMISSIONS_KEY, keys);
