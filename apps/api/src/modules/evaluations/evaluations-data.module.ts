import { Module } from '@nestjs/common';
import { EvaluationRepository } from './evaluation.repository';

/**
 * The evaluation repository alone, with no imports, so AuthModule can read how many requests block
 * a user (the token's pendingEvaluation claim and Me.pendingEvaluations) without importing the
 * evaluations feature and its dependencies.
 */
@Module({ providers: [EvaluationRepository], exports: [EvaluationRepository] })
export class EvaluationsDataModule {}
