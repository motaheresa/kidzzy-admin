import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateInstructorDto, EMAIL_OR_PHONE } from './create-instructor.dto';
import { UpdateInstructorDto } from './update-instructor.dto';

async function errorsOf(cls: new () => object, body: object): Promise<Record<string, string[]>> {
  const errors = await validate(plainToInstance(cls, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return Object.fromEntries(errors.map((e) => [e.property, Object.values(e.constraints ?? {})]));
}

const base = { name: 'Mona', temporaryPassword: 'temp-pass-1' };

describe('CreateInstructorDto', () => {
  it.each([
    ['an email', { email: 'mona@kidzzy.test' }],
    ['a phone', { phone: '010 1234-5678' }],
    ['both', { email: 'mona@kidzzy.test', phone: '01012345678' }],
  ])('accepts %s', async (_label, login) => {
    expect(await errorsOf(CreateInstructorDto, { ...base, ...login })).toEqual({});
  });

  it('refuses neither email nor phone, with an error on both fields', async () => {
    const errors = await errorsOf(CreateInstructorDto, base);
    expect(Object.keys(errors).sort()).toEqual(['email', 'phone']);
    expect(errors.email).toContain(EMAIL_OR_PHONE);
    expect(errors.phone).toContain(EMAIL_OR_PHONE);
  });

  it.each([
    ['a bad email', { email: 'not-an-email' }, 'email'],
    ['a bad phone', { phone: '12ab' }, 'phone'],
    ['a short password', { email: 'm@k.test', temporaryPassword: 'short' }, 'temporaryPassword'],
    ['a blank name', { email: 'm@k.test', name: '   ' }, 'name'],
    ['an unknown field', { email: 'm@k.test', isActive: false }, 'isActive'],
  ])('refuses %s', async (_label, body, field) => {
    expect(Object.keys(await errorsOf(CreateInstructorDto, { ...base, ...body }))).toEqual([field]);
  });
});

describe('UpdateInstructorDto', () => {
  it('accepts an empty body, and null to remove the email or the phone', async () => {
    expect(await errorsOf(UpdateInstructorDto, {})).toEqual({});
    expect(await errorsOf(UpdateInstructorDto, { email: null, phone: '01012345678' })).toEqual({});
  });

  it('refuses a null name', async () => {
    expect(Object.keys(await errorsOf(UpdateInstructorDto, { name: null }))).toEqual(['name']);
  });
});
