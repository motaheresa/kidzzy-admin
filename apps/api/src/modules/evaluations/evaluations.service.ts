import { HttpStatus, Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import {
  ErrorCode,
  NotificationType,
  type EvaluationRequest,
  type StudentEvaluation,
} from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { AccessContext } from '../auth/access-context';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Clock } from '../sessions/clock';
import type { SessionRow } from '../sessions/session.repository';
import type { SubmitEvaluationDto } from './dto/submit-evaluation.dto';
import { toEvaluationRequest, toStudentEvaluation } from './evaluation.mapper';
import { EvaluationRepository, type EvaluationRow, type NewRequest } from './evaluation.repository';

/** Where the notification sends the instructor: the evaluation screen. */
export const EVALUATION_SCREEN_URL = '/evaluation';

/**
 * Required student evaluations (US-42, SCRUM-87). A request is created when a student cycle
 * becomes Due (the hook) or by the admin; the instructor it is addressed to writes it. The text is
 * about a child: it never goes into a notification or an audit row, which carry ids and status.
 */
@Injectable()
export class EvaluationsService {
  constructor(
    private readonly evaluations: EvaluationRepository,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly access: AccessContext,
    private readonly clock: Clock,
  ) {}

  /**
   * The requests a Held session made by turning student cycles Due (called by the hook, inside the
   * Held's transaction). Addressed to the instructor on the session, not the group's current one.
   * A student who already has a pending request gets no second one.
   */
  async requestForDueCycles(
    session: SessionRow,
    cycles: { id: string; studentId: string }[],
    at: Date,
  ): Promise<void> {
    for (const cycle of cycles) {
      await this.create({
        studentId: cycle.studentId,
        instructorId: session.instructorId,
        groupId: session.group.id,
        source: 'cycle_due',
        cycleId: cycle.id,
        requestedById: null,
        requestedAt: at,
      });
    }
  }

  /**
   * The undo of a Held took some cycles back from Due: their pending requests are cancelled. A
   * submitted evaluation stays (it was written; the undo does not erase it).
   */
  async cancelForCyclesNoLongerDue(at: Date): Promise<void> {
    const stale = await this.evaluations.listPendingWithCycleNoLongerDue();
    for (const request of stale) {
      await this.evaluations.cancel(request.id, at);
      await this.audit.record({
        action: 'evaluation_request.cancelled',
        entityType: 'student_evaluations',
        entityId: request.id,
        before: { status: 'pending' },
        after: { status: 'cancelled', reason: 'held_undone', cycleId: request.cycleId },
      });
    }
  }

  /**
   * POST /students/{id}/evaluation-requests: the admin asks the instructor of the student's open
   * enrollment for an evaluation now, whatever the setting.
   */
  @Transactional()
  async requestForStudent(studentId: string): Promise<EvaluationRequest> {
    const student = await this.evaluations.findStudentForRequest(studentId);
    if (!student) throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND);
    if (!student.openGroup) {
      throw new AppException(
        ErrorCode.NoActiveEnrollment,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'The student has no open enrollment, so no instructor to ask',
      );
    }
    const created = await this.create({
      studentId,
      instructorId: student.openGroup.instructorId,
      groupId: student.openGroup.id,
      source: 'admin',
      cycleId: null,
      requestedById: this.access.userId,
      requestedAt: this.clock.now(),
    });
    if (!created) {
      throw new AppException(
        ErrorCode.EvaluationPending,
        HttpStatus.CONFLICT,
        'The student already has a pending evaluation request',
      );
    }
    return toEvaluationRequest(created);
  }

  /** GET /evaluation-requests?status=pending: the academy's pending requests (the admin). */
  async listPending(status: 'pending'): Promise<EvaluationRequest[]> {
    return (await this.evaluations.listByStatus(status)).map(toEvaluationRequest);
  }

  /** POST /evaluation-requests/{id}/cancel: the admin cancels a pending request. */
  @Transactional()
  async cancel(id: string): Promise<EvaluationRequest> {
    await this.evaluations.lock(id);
    const request = await this.findOrNotFound(id);
    this.ensurePending(request);
    const cancelled = await this.evaluations.cancel(id, this.clock.now());
    await this.audit.record({
      action: 'evaluation_request.cancelled',
      entityType: 'student_evaluations',
      entityId: id,
      before: { status: 'pending' },
      after: { status: 'cancelled', source: request.source, cycleId: request.cycleId },
    });
    return toEvaluationRequest(cancelled);
  }

  /** GET /me/evaluation-requests: the requests that block the caller now, oldest first. */
  async listMine(): Promise<EvaluationRequest[]> {
    return (await this.evaluations.listBlockingFor(this.access.userId)).map(toEvaluationRequest);
  }

  /**
   * POST /evaluation-requests/{id}/submit: only the instructor it is addressed to, only while it is
   * pending. The row is locked first, so two submits (or a submit and a cancel) cannot both pass.
   */
  @Transactional()
  async submit(id: string, dto: SubmitEvaluationDto): Promise<StudentEvaluation> {
    await this.evaluations.lock(id);
    const request = await this.findOrNotFound(id);
    if (request.instructorId !== this.access.userId) {
      throw new AppException(ErrorCode.Forbidden, HttpStatus.FORBIDDEN, 'Not addressed to you');
    }
    this.ensurePending(request);
    const submitted = await this.evaluations.submit(
      id,
      {
        overallRating: dto.overallRating,
        summary: dto.summary,
        strengths: dto.strengths ?? null,
        toImprove: dto.toImprove ?? null,
      },
      this.clock.now(),
    );
    await this.audit.record({
      action: 'evaluation_request.submitted',
      entityType: 'student_evaluations',
      entityId: id,
      before: { status: 'pending' },
      after: { status: 'submitted', source: request.source, cycleId: request.cycleId },
    });
    return toStudentEvaluation(submitted);
  }

  /** GET /students/{id}/evaluations: the student's written evaluations, newest first. */
  async listForStudent(studentId: string): Promise<StudentEvaluation[]> {
    if (!(await this.evaluations.studentExists(studentId))) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND);
    }
    return (await this.evaluations.listSubmittedForStudent(studentId)).map(toStudentEvaluation);
  }

  /** GET /me/evaluations: the evaluations the caller wrote, newest first. */
  async listWritten(): Promise<StudentEvaluation[]> {
    return (await this.evaluations.listWrittenBy(this.access.userId)).map(toStudentEvaluation);
  }

  /**
   * Creates a pending request, then tells its instructor and records it. Null when the student
   * already has a pending one. The notification names the student and the group, never any text.
   */
  private async create(request: NewRequest): Promise<EvaluationRow | null> {
    const created = await this.evaluations.createPending(request);
    if (!created) return null;
    await this.notifications.notify(created.instructorId, {
      type: NotificationType.EvaluationRequest,
      title: `مطلوب تقييم للطالب ${created.student.name}`,
      body: `جروب ${created.group.name}`,
      data: { url: EVALUATION_SCREEN_URL, requestId: created.id },
    });
    await this.audit.record({
      action: 'evaluation_request.created',
      entityType: 'student_evaluations',
      entityId: created.id,
      after: {
        status: 'pending',
        source: created.source,
        studentId: created.studentId,
        instructorId: created.instructorId,
        cycleId: created.cycleId,
      },
    });
    return created;
  }

  private async findOrNotFound(id: string): Promise<EvaluationRow> {
    const request = await this.evaluations.findById(id);
    if (!request) throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND);
    return request;
  }

  private ensurePending(request: EvaluationRow): void {
    if (request.status !== 'pending') {
      throw new AppException(
        ErrorCode.EvaluationNotPending,
        HttpStatus.CONFLICT,
        'The request is no longer pending',
      );
    }
  }
}
