import { ArrayMinSize, IsArray, IsUUID, ValidateIf } from 'class-validator';
import { MATERIAL_LINK_TITLE_MAX, MATERIAL_LINK_URL_MAX } from '@kidzzy/shared';
import { HttpUrl } from '../../../common/validation/http-url';
import { TextLength } from '../../../common/validation/text-length';
import { Trim } from '../../../common/validation/transforms';

/** POST /material-links body (openapi.yaml: MaterialLinkCreate). */
export class CreateMaterialLinkDto {
  @Trim()
  @TextLength(1, MATERIAL_LINK_TITLE_MAX)
  title!: string;

  @Trim()
  @HttpUrl(MATERIAL_LINK_URL_MAX)
  url!: string;
}

/**
 * PATCH /material-links/{id} body (openapi.yaml: MaterialLinkUpdate). A field that is left out
 * stays as it is; null is not "left out", so it is refused.
 */
export class UpdateMaterialLinkDto {
  @ValidateIf((dto: UpdateMaterialLinkDto) => dto.title !== undefined)
  @Trim()
  @TextLength(1, MATERIAL_LINK_TITLE_MAX)
  title?: string;

  @ValidateIf((dto: UpdateMaterialLinkDto) => dto.url !== undefined)
  @Trim()
  @HttpUrl(MATERIAL_LINK_URL_MAX)
  url?: string;
}

/**
 * PUT /material-links/order body (openapi.yaml: MaterialOrder). Only the shape is checked here
 * (400); whether the ids are exactly the academy's links is the service's rule (422).
 */
export class MaterialOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  ids!: string[];
}
