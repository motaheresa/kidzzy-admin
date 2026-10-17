import { HttpStatus, Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { ErrorCode, type Page, type Student } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { pageWindow, toPage } from '../../common/pagination/page';
import { AcademyRepository } from '../academies/academy.repository';
import { AccessContext } from '../auth/access-context';
import { Clock } from '../sessions/clock';
import { dateToString } from '../sessions/dates';
import { addDays, laterDate, localDateOf } from '../sessions/occurrences';
import type { CreateStudentDto } from './dto/create-student.dto';
import type { ListStudentsQueryDto } from './dto/list-students.query';
import type { UpdateStudentDto } from './dto/update-student.dto';
import { toStudent } from './student.mapper';
import { StudentRepository, type StudentRow } from './student.repository';

/**
 * Student records (US-05): list, read, create, edit and deactivate. Records are never deleted,
 * so a student's history and payments stay.
 *
 * Read scope (students.read): `any` (the admin) sees every student. `own` (an instructor) sees
 * the students with an open enrollment in a group they teach: the list is limited to them, and
 * any other student is 403.
 */
@Injectable()
export class StudentsService {
  constructor(
    private readonly students: StudentRepository,
    private readonly access: AccessContext,
    private readonly academies: AcademyRepository,
    private readonly clock: Clock,
  ) {}

  async list(query: ListStudentsQueryDto): Promise<Page<Student>> {
    const scope = this.access.scopeFor('students.read');
    const { rows, total } = await this.students.list(
      {
        isActive: query.isActive,
        search: query.search || undefined,
        groupId: query.groupId,
        instructorId: scope === 'own' ? this.access.userId : undefined,
      },
      pageWindow(query),
    );
    return toPage(rows.map(toStudent), query, total);
  }

  async get(id: string): Promise<Student> {
    const student = await this.findOrThrow(id);
    // The owner is the instructor of the student's current group; a student in no group has none,
    // so scope `own` is refused (403) and scope `any` passes.
    const owner = student.enrollments[0]?.group.instructorId ?? null;
    this.access.ensureOwner(this.access.scopeFor('students.read'), owner);
    return toStudent(student);
  }

  async create(dto: CreateStudentDto): Promise<Student> {
    return toStudent(
      await this.students.create({
        code: dto.code,
        name: dto.name,
        age: dto.age ?? null,
        parentName: dto.parentName,
        parentPhone: dto.parentPhone,
        notes: dto.notes || null, // empty notes are no notes
      }),
    );
  }

  async update(id: string, dto: UpdateStudentDto): Promise<Student> {
    await this.findOrThrow(id);
    const changes = { ...dto };
    if (dto.notes !== undefined) changes.notes = dto.notes || null;
    return toStudent(await this.students.update(id, changes));
  }

  /**
   * Deactivates the student and ends their open enrollment (openapi.yaml), in one transaction.
   * Idempotent. Nothing is deleted: the enrollment stays as history, and the cycles and plan stay
   * with the student (they continue if the student is enrolled again).
   *
   * Leaving today makes yesterday the enrollment's last day (end_date = today - 1, the same rule
   * as a transfer), so a session held today no longer counts for the student. An enrollment that
   * starts in the future ends the day before it starts: it covered no day.
   */
  @Transactional()
  async deactivate(id: string): Promise<Student> {
    await this.students.lock(id);
    const student = await this.findOrThrow(id);
    const open = student.enrollments[0];
    const today = localDateOf(this.clock.now(), await this.academies.findTimezone());
    const lastDay = open
      ? laterDate(addDays(today, -1), addDays(dateToString(open.startDate), -1))
      : today;
    // TODO(US-35): audit log, the enrollment ended by the deactivation.
    return toStudent(await this.students.deactivate(id, lastDay));
  }

  private async findOrThrow(id: string): Promise<StudentRow> {
    const student = await this.students.findById(id);
    if (!student) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such student');
    }
    return student;
  }
}
