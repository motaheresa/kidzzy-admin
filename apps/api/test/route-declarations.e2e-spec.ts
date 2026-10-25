import type { INestApplication } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import {
  accessDeclarationsOf,
  isAllowedDuringPasswordChange,
} from '../src/modules/auth/access.decorators';

// Fail closed (CLAUDE.md, Authorization): every route of the REAL app must declare exactly one of
// @Public(), @SignedIn() or @RequirePermission(). This walks every registered controller method
// with a route, so a new endpoint without a declaration fails CI here, by name.

describe('Route access declarations (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function routes() {
    const discovery = app.get(DiscoveryService);
    const scanner = app.get(MetadataScanner);
    return discovery.getControllers().flatMap((wrapper) => {
      const controller = wrapper.metatype as (new (...args: never[]) => object) | undefined;
      if (!controller) return [];
      const prototype = controller.prototype as Record<string, unknown>;
      const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
      return scanner.getAllMethodNames(prototype).flatMap((name) => {
        const handler = prototype[name] as () => unknown;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (method === undefined) return []; // a helper method, not a route
        const path = String(Reflect.getMetadata(PATH_METADATA, handler) ?? '');
        const segments = [base, path].map((p) => p.replace(/^\/+|\/+$/g, '')).filter(Boolean);
        return [
          {
            route: `${RequestMethod[method]} /${segments.join('/')}`,
            declarations: accessDeclarationsOf(handler, controller),
            allowedDuringPasswordChange: isAllowedDuringPasswordChange(handler),
          },
        ];
      });
    });
  }

  it('finds the routes of the app', () => {
    const found = routes().map((r) => r.route);
    expect(found).toEqual(
      expect.arrayContaining(['GET /health', 'POST /auth/login', 'GET /auth/me']),
    );
  });

  it('every route declares exactly one access rule', () => {
    const offenders = routes()
      .filter((r) => r.declarations.length !== 1)
      .map((r) => `${r.route} declares ${r.declarations.length}`);
    expect(offenders).toEqual([]);
  });

  it('only these routes work while a temporary password must be changed (US-02)', () => {
    // Adding @AllowedDuringPasswordChange() to any other route fails here, by name: a user with
    // a temporary password must not reach data before choosing their own password.
    const allowed = routes()
      .filter((r) => r.allowedDuringPasswordChange)
      .map((r) => r.route)
      .sort();
    // POST /auth/logout is @Public() (SCRUM-54), so it never waits on a password change.
    expect(allowed).toEqual(['GET /auth/me', 'POST /auth/change-password']);
  });
});
