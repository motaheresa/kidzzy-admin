import { Global, Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { TenantContext } from './tenant-context';

/**
 * Global module that gives each request its own TenantContext.
 * `middleware.mount` starts a fresh nestjs-cls store at the beginning of every HTTP request.
 */
@Global()
@Module({
  imports: [ClsModule.forRoot({ global: true, middleware: { mount: true } })],
  providers: [TenantContext],
  exports: [TenantContext],
})
export class TenancyModule {}
