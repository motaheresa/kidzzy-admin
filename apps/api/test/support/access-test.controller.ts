import { Controller, Get, Param } from '@nestjs/common';
import { AccessContext } from '../../src/modules/auth/access-context';
import { RequirePermission } from '../../src/modules/auth/access.decorators';

/**
 * TEST ONLY. Added by createTestApp({ extraControllers }) in permissions.e2e-spec.ts, never part
 * of AppModule: it exercises the authorization mechanism before any real feature endpoint exists.
 */
@Controller('__test/access')
export class AccessTestController {
  constructor(private readonly access: AccessContext) {}

  /** What a list endpoint does: require the action, then ask for the caller's scope. */
  @RequirePermission('groups.read')
  @Get('groups')
  listGroups(): { scope: string } {
    return { scope: this.access.scopeFor('groups.read') };
  }

  /** What a single-record endpoint does: the record's owner must be the caller when scope is own. */
  @RequirePermission('groups.read')
  @Get('groups/:ownerId')
  readGroup(@Param('ownerId') ownerId: string): { ownerId: string } {
    this.access.ensureOwner(this.access.scopeFor('groups.read'), ownerId);
    return { ownerId };
  }

  /** An action the Instructor role does not have. */
  @RequirePermission('payments.manage')
  @Get('payments-manage')
  managePayments(): { ok: true } {
    return { ok: true };
  }
}
