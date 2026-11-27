import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MaterialLinkRepository } from './material-link.repository';
import { MaterialLinkService } from './material-link.service';
import { MaterialLinksController } from './material-links.controller';

/** Course material links (US-32, US-33). */
@Module({
  imports: [AuditModule],
  controllers: [MaterialLinksController],
  providers: [MaterialLinkRepository, MaterialLinkService],
})
export class MaterialLinksModule {}
