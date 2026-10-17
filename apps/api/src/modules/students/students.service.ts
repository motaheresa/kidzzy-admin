import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type Page, type Student } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { pageWindow, toPage } from '../../common/pagination/page';
import { AccessContext } from '../auth/access-context';
import type { CreateStudentDto } from './dto/create-student.dto';
import type { ListStudentsQueryDto } from './dto/list-students.query';
import type { UpdateStudentDto } from './dto/update-student.dto';
import { toStudent } from './student.mapper';
import { StudentRepository, type StudentRow } from './student.repository';

/**
 * Student records (US-05): list, read, create, edit and deactivate. Records are never deleted,
 * so a student's history and payments stay.
 *
 * Read scope (students.read): `any` (the admin) sees every student. `own` (an instructor) means
 * the students of the groups they teach, and groups do not exist yet, so today an instructor
 * sees an empty list and gets 403 for a single student.
 * TODO(US-07/US-08): filter by the caller's groups once enrollments exist.
 */
@Injectable()
export class StudentsService {
  constructor(
    private readonly students: StudentRepository,
    private readonly access: AccessContext,
  ) {}

  async list(query: ListStudentsQueryDto): Promise<Page<Student>> {
    const scope = this.access.scopeFor('students.read');
    // No enrollments yet: nobody is in a group, so a group filter matches nobody (TODO US-08),
    // and an instructor teaches nobody (TODO US-07/US-08).
    if (scope === 'own' || query.groupId !== undefined) return toPage([], query, 0);

    const { rows, total } = await this.students.list(
      { isActive: query.isActive, search: query.search || undefined },
      pageWindow(query),
    );
    return toPage(rows.map(toStudent), query, total);
  }

  async get(id: string): Promise<Student> {
    const student = await this.findOrThrow(id);
    // TODO(US-07/US-08): the owner is the instructor of the student's current group. With no
    // groups there is no owner, so scope `own` is refused (403) and scope `any` passes.
    this.access.ensureOwner(this.access.scopeFor('students.read'), null);
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
   * Idempotent. Nothing is deleted.
   * TODO(US-08): "and end the enrollment" (openapi.yaml), once enrollments exist; then this
   * writes two rows and becomes @Transactional().
   */
  async deactivate(id: string): Promise<Student> {
    await this.findOrThrow(id);
    return toStudent(await this.students.setActive(id, false));
  }

  private async findOrThrow(id: string): Promise<StudentRow> {
    const student = await this.students.findById(id);
    if (!student) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such student');
    }
    return student;
  }
}
