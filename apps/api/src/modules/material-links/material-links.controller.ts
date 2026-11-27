import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import type { MaterialLink } from '@kidzzy/shared';
import { RequirePermission } from '../auth/access.decorators';
import {
  CreateMaterialLinkDto,
  MaterialOrderDto,
  UpdateMaterialLinkDto,
} from './dto/material-link.dto';
import { MaterialLinkService } from './material-link.service';

/** /material-links (US-32, US-33): the admin keeps the list, instructors read it. HTTP only. */
@Controller('material-links')
export class MaterialLinksController {
  constructor(private readonly links: MaterialLinkService) {}

  @RequirePermission('materials.read')
  @Get()
  async list(): Promise<{ data: MaterialLink[] }> {
    return { data: await this.links.list() };
  }

  @RequirePermission('materials.manage')
  @Post()
  create(@Body() dto: CreateMaterialLinkDto): Promise<MaterialLink> {
    return this.links.create(dto);
  }

  /** Declared before the `:id` routes, so "order" is never read as an id. */
  @RequirePermission('materials.manage')
  @Put('order')
  async reorder(@Body() dto: MaterialOrderDto): Promise<{ data: MaterialLink[] }> {
    return { data: await this.links.reorder(dto) };
  }

  @RequirePermission('materials.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaterialLinkDto,
  ): Promise<MaterialLink> {
    return this.links.update(id, dto);
  }

  @RequirePermission('materials.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.links.remove(id);
  }
}
