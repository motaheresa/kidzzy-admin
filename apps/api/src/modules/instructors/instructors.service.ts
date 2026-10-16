import { HttpStatus, Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { ErrorCode, type Instructor, type InstructorDetail, type Page } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { pageWindow, toPage } from '../../common/pagination/page';
import { AuthService } from '../auth/auth.service';
import { PasswordService } from '../auth/password.service';
import { EMAIL_OR_PHONE, type CreateInstructorDto } from './dto/create-instructor.dto';
import type { ListInstructorsQueryDto } from './dto/list-instructors.query';
import type { UpdateInstructorDto } from './dto/update-instructor.dto';
import { toInstructor, toInstructorDetail } from './instructor.mapper';
import { InstructorRepository, type InstructorRow } from './instructor.repository';

/**
 * Instructor accounts (US-04): list, read, create, edit, deactivate and reactivate.
 * Accounts are never deleted, so an instructor's history stays.
 *
 * The instructors permissions exist only with scope `any` (packages/shared permissions.ts), so
 * whoever passes @RequirePermission sees every instructor: there is no `own` filter to apply.
 */
@Injectable()
export class InstructorsService {
  constructor(
    private readonly instructors: InstructorRepository,
    private readonly passwords: PasswordService,
    private readonly auth: AuthService,
  ) {}

  async list(query: ListInstructorsQueryDto): Promise<Page<Instructor>> {
    const { rows, total } = await this.instructors.list(
      { search: query.search || undefined, isActive: query.isActive },
      pageWindow(query),
    );
    return toPage(rows.map(toInstructor), query, total);
  }

  async get(id: string): Promise<InstructorDetail> {
    const instructor = await this.findOrThrow(id);
    // TODO(US-07): the groups this instructor teaches, once groups exist.
    return toInstructorDetail(instructor, []);
  }

  /**
   * The password is hashed first, outside the transaction: argon2 is slow on purpose, and a
   * transaction should never stay open while it runs.
   */
  async create(dto: CreateInstructorDto): Promise<Instructor> {
    const passwordHash = await this.passwords.hash(dto.temporaryPassword);
    return toInstructor(await this.insert(dto, passwordHash));
  }

  /** The role lookup and the user with its role, in one transaction. */
  @Transactional()
  private insert(dto: CreateInstructorDto, passwordHash: string): Promise<InstructorRow> {
    return this.instructors.create({
      name: dto.name,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      passwordHash,
    });
  }

  async update(id: string, dto: UpdateInstructorDto): Promise<Instructor> {
    const current = await this.findOrThrow(id);
    const email = dto.email === undefined ? current.email : dto.email;
    const phone = dto.phone === undefined ? current.phone : dto.phone;
    if (email === null && phone === null) {
      // The account needs something to log in with (the users check constraint says the same).
      throw new AppException(ErrorCode.ValidationFailed, HttpStatus.BAD_REQUEST, EMAIL_OR_PHONE, [
        { field: 'email', message: EMAIL_OR_PHONE },
        { field: 'phone', message: EMAIL_OR_PHONE },
      ]);
    }
    return toInstructor(await this.instructors.update(id, dto));
  }

  /**
   * AC: a deactivated instructor cannot log in (login only finds active users), and every
   * session ends: no refresh works, so the access token they hold stops within 15 minutes
   * (ADR-0013). Both writes in one transaction. Idempotent.
   * TODO(US-07): an inactive instructor cannot be assigned to a new group.
   */
  @Transactional()
  async deactivate(id: string): Promise<Instructor> {
    await this.findOrThrow(id);
    const instructor = await this.instructors.setActive(id, false);
    await this.auth.revokeAllSessions(id);
    return toInstructor(instructor);
  }

  /**
   * POST /instructors/{id}/reset-password (US-02). AC: the admin sets a temporary password, and
   * the instructor must change it at the next login. Every session ends, so no device keeps
   * working with the old password beyond its access token (15 minutes, ADR-0013).
   * The hash is computed before the transaction (argon2 is slow on purpose).
   */
  async resetPassword(id: string, temporaryPassword: string): Promise<void> {
    await this.findOrThrow(id);
    const passwordHash = await this.passwords.hash(temporaryPassword);
    await this.replacePassword(id, passwordHash);
  }

  @Transactional()
  private async replacePassword(id: string, passwordHash: string): Promise<void> {
    await this.instructors.setTemporaryPassword(id, passwordHash);
    await this.auth.revokeAllSessions(id);
  }

  /** The instructor can log in again with their password. Idempotent. */
  async reactivate(id: string): Promise<Instructor> {
    await this.findOrThrow(id);
    return toInstructor(await this.instructors.setActive(id, true));
  }

  private async findOrThrow(id: string): Promise<InstructorRow> {
    const instructor = await this.instructors.findById(id);
    if (!instructor) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such instructor');
    }
    return instructor;
  }
}
