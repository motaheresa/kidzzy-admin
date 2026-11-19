import { Injectable, OnModuleInit } from '@nestjs/common';
import { AcademyRepository } from '../academies/academy.repository';
import { Clock } from '../sessions/clock';
import { SessionHeldHooks, type SessionHeldHook } from '../sessions/session-held-hooks';
import type { SessionRow } from '../sessions/session.repository';
import { EvaluationRepository } from './evaluation.repository';
import { EvaluationsService } from './evaluations.service';

/**
 * Creates and cancels the cycle_due evaluation requests from the Held flow (US-42), inside the
 * Held's (or the undo's) own transaction.
 *
 * Order matters and is guaranteed: EvaluationsModule imports CyclesModule, so Nest initialises
 * the cycle counting first and its hook registers first. afterHeld runs after every onHeld, so the
 * cycles are already counted; onUndone runs after the counting hook has taken them back from Due.
 */
@Injectable()
export class EvaluationRequestHook implements SessionHeldHook, OnModuleInit {
  constructor(
    private readonly hooks: SessionHeldHooks,
    private readonly academies: AcademyRepository,
    private readonly evaluations: EvaluationRepository,
    private readonly service: EvaluationsService,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    this.hooks.register(this);
  }

  /** A student cycle this session turned Due asks the instructor on the session, when the rule is on. */
  async afterHeld(session: SessionRow, at: Date): Promise<void> {
    if (!(await this.academies.findEvaluationsRequired())) return;
    const cycles = await this.evaluations.listDueStudentCyclesOf(session.id);
    if (cycles.length === 0) return;
    await this.service.requestForDueCycles(session, cycles, at);
  }

  /** The undo took cycles back from Due: their pending requests are cancelled, submitted ones stay. */
  async onUndone(): Promise<void> {
    await this.service.cancelForCyclesNoLongerDue(this.clock.now());
  }
}
