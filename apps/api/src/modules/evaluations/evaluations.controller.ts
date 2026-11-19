import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { EvaluationRequest, StudentEvaluation } from '@kidzzy/shared';
import { AllowedDuringEvaluation, RequirePermission } from '../auth/access.decorators';
import { ListEvaluationRequestsQueryDto } from './dto/list-evaluation-requests.query';
import { SubmitEvaluationDto } from './dto/submit-evaluation.dto';
import { EvaluationsService } from './evaluations.service';

/**
 * Required student evaluations (US-42). HTTP only. The two routes the instructor needs to write a
 * pending evaluation are @AllowedDuringEvaluation(): every other route answers 403
 * EVALUATION_REQUIRED until it is written (PermissionsGuard, ADR-0013 amendment).
 */
@Controller()
export class EvaluationsController {
  constructor(private readonly evaluations: EvaluationsService) {}

  @RequirePermission('evaluations.manage')
  @Post('students/:id/evaluation-requests')
  request(@Param('id', ParseUUIDPipe) id: string): Promise<EvaluationRequest> {
    return this.evaluations.requestForStudent(id);
  }

  @RequirePermission('evaluations.manage')
  @Get('evaluation-requests')
  listPending(@Query() query: ListEvaluationRequestsQueryDto): Promise<EvaluationRequest[]> {
    return this.evaluations.listPending(query.status ?? 'pending');
  }

  @RequirePermission('evaluations.manage')
  @Post('evaluation-requests/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<EvaluationRequest> {
    return this.evaluations.cancel(id);
  }

  @RequirePermission('evaluations.write')
  @AllowedDuringEvaluation() // the evaluation screen lists them
  @Get('me/evaluation-requests')
  listMine(): Promise<EvaluationRequest[]> {
    return this.evaluations.listMine();
  }

  @RequirePermission('evaluations.write')
  @AllowedDuringEvaluation() // writing it is what lifts the gate
  @Post('evaluation-requests/:id/submit')
  @HttpCode(HttpStatus.OK)
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitEvaluationDto,
  ): Promise<StudentEvaluation> {
    return this.evaluations.submit(id, dto);
  }

  @RequirePermission('evaluations.write')
  @Get('me/evaluations')
  listWritten(): Promise<StudentEvaluation[]> {
    return this.evaluations.listWritten();
  }

  @RequirePermission('evaluations.read')
  @Get('students/:id/evaluations')
  listForStudent(@Param('id', ParseUUIDPipe) id: string): Promise<StudentEvaluation[]> {
    return this.evaluations.listForStudent(id);
  }
}
