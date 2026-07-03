import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '@archivato/shared';
import { AdminGuard } from './admin.guard';

function ctxFor(user: Partial<AuthUser> | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  it('allows an admin through', () => {
    expect(guard.canActivate(ctxFor({ id: 'u1', role: 'admin' }))).toBe(true);
  });

  it('403s a normal user', () => {
    expect(() => guard.canActivate(ctxFor({ id: 'u1', role: 'user' }))).toThrow(
      ForbiddenException,
    );
  });

  it('403s when no user is present', () => {
    expect(() => guard.canActivate(ctxFor(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
