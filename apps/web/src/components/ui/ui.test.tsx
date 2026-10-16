import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Alert, Button, EmptyState, FormField, Spinner } from '.';

describe('Button', () => {
  it('runs onClick from a click, Enter and Space', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>حفظ</Button>);

    await user.click(screen.getByRole('button', { name: 'حفظ' }));
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('is type="button" by default, so it never submits a form by accident', () => {
    render(<Button>عادي</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('ignores clicks when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        حفظ
      </Button>,
    );
    await userEvent.setup().click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('while loading: busy, disabled, and the label stays', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        جاري الحفظ
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'جاري الحفظ' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
    await userEvent.setup().click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders a link with the button look when asChild', () => {
    render(
      <Button asChild variant="outline">
        <a href="/groups">الجروبات</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'الجروبات' });
    expect(link).toHaveAttribute('href', '/groups');
    expect(link).toHaveAttribute('data-slot', 'button');
  });

  it('can be reached with Tab and shows focus', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Button>الأول</Button>
        <Button>التاني</Button>
      </>,
    );
    await user.tab();
    expect(screen.getByRole('button', { name: 'الأول' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'التاني' })).toHaveFocus();
  });
});

describe('FormField', () => {
  it('connects the label to its input', async () => {
    const user = userEvent.setup();
    render(<FormField label="الاسم" name="name" />);
    await user.click(screen.getByText('الاسم'));
    expect(screen.getByLabelText('الاسم')).toHaveFocus();
  });

  it('links the hint with aria-describedby and is valid without an error', () => {
    render(<FormField label="الموبايل" hint="مثال: 01012345678" />);
    const input = screen.getByLabelText('الموبايل');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).toHaveAccessibleDescription('مثال: 01012345678');
  });

  it('marks the input invalid and describes it with the error and the hint', () => {
    render(<FormField label="الايميل" hint="ايميل الشغل" error="اكتب ايميل صحيح" />);
    const input = screen.getByLabelText('الايميل');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('ايميل الشغل اكتب ايميل صحيح');
    expect(screen.getByText('اكتب ايميل صحيح')).toBeInTheDocument();
  });

  it('keeps an id given by the caller', () => {
    render(<FormField label="كود الطالب" id="student-code" />);
    expect(screen.getByLabelText('كود الطالب')).toHaveAttribute('id', 'student-code');
  });
});

describe('Alert', () => {
  it.each([
    ['danger', 'alert'],
    ['warning', 'alert'],
    ['info', 'status'],
    ['success', 'status'],
  ] as const)('a %s alert has role %s and its text once', (variant, role) => {
    render(<Alert variant={variant}>رسالة</Alert>);
    expect(screen.getByRole(role)).toHaveTextContent(/^رسالة$/);
  });
});

describe('Spinner and EmptyState', () => {
  it('Spinner announces its Arabic label', () => {
    render(<Spinner />);
    expect(screen.getByRole('status', { name: 'جاري التحميل' })).toBeInTheDocument();
  });

  it('EmptyState shows its title, text and a working action', async () => {
    const onAdd = vi.fn();
    render(
      <EmptyState
        title="مفيش جروبات لسه"
        description="ابدأ بأول جروب"
        action={<Button onClick={onAdd}>إضافة جروب</Button>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'مفيش جروبات لسه' })).toBeInTheDocument();
    expect(screen.getByText('ابدأ بأول جروب')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'إضافة جروب' }));
    expect(onAdd).toHaveBeenCalledOnce();
  });
});
