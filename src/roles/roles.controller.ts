import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { GrantRoleDto } from './dto/grant-role.dto';
import { RolesService } from './roles.service';

@Controller()
@UseGuards(SessionGuard, PermissionGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('roles')
  @RequirePermissions('role.manage')
  listRoles() {
    return this.roles.listRoles();
  }

  @Get('permissions')
  @RequirePermissions('role.manage')
  listPermissions() {
    return this.roles.listPermissions();
  }

  @Get('members/:id/roles')
  @RequirePermissions('role.manage')
  memberRoles(@Param('id') id: string) {
    return this.roles.memberRoles(id);
  }

  @Post('members/:id/roles')
  @RequirePermissions('role.manage')
  grant(@Param('id') id: string, @Body() dto: GrantRoleDto) {
    return this.roles.grant(id, dto);
  }

  @Delete('members/:id/roles/:roleId')
  @RequirePermissions('role.manage')
  revoke(@Param('id') id: string, @Param('roleId') roleId: string) {
    return this.roles.revoke(id, roleId);
  }
}
