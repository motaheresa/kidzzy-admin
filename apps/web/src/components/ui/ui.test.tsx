import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  Alert,
  Button,
  ConfirmDialog,
  DetailList,
  EmptyState,
  FormField,
  Pagination,
  SEARCH_DEBOUNCE_MS,
  SearchInput,
  Spinner,
  TextareaField,
  ToggleGroup,
  ToggleGroupItem,
} from '.';

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

describe('TextareaField', () => {
  it('connects the label, the hint and the error to a textarea', () => {
    render(<TextareaField label="ملاحظات" hint="اختياري" error="الملاحظات 1000 حرف على الاكتر" />);
    const textarea = screen.getByLabelText('ملاحظات');
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea).toHaveAccessibleDescription('اختياري الملاحظات 1000 حرف على الاكتر');
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

describe('ConfirmDialog', () => {
  function Harness({
    busy = false,
    onConfirm = vi.fn(),
  }: {
    busy?: boolean;
    onConfirm?: () => void;
  }) {
    const [open, setOpen] = useState(false);
    return (
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        trigger={<Button>ايقاف</Button>}
        title="توقف المدرس؟"
        description="مش هيقدر يدخل تاني"
        confirmLabel="ايوه، وقفه"
        tone="danger"
        busy={busy}
        onConfirm={onConfirm}
      />
    );
  }

  it('opens from its trigger, asks, and confirms', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'ايقاف' }));
    const dialog = screen.getByRole('alertdialog', { name: 'توقف المدرس؟' });
    expect(dialog).toHaveAccessibleDescription('مش هيقدر يدخل تاني');
    await user.click(screen.getByRole('button', { name: 'ايوه، وقفه' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('cancels with رجوع without confirming, and returns the focus to the trigger', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'ايقاف' }));
    await user.click(screen.getByRole('button', { name: 'رجوع' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'ايقاف' })).toHaveFocus();
  });

  it('cannot be dismissed while busy', async () => {
    const user = userEvent.setup();
    render(<Harness busy />);
    await user.click(screen.getByRole('button', { name: 'ايقاف' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ايوه، وقفه' })).toHaveAttribute('aria-busy', 'true');
  });
});

describe('Pagination', () => {
  it('moves between pages and stops at the ends', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const { rerender } = render(
      <Pagination page={1} pageSize={20} total={45} onPageChange={onPageChange} />,
    );
    expect(screen.getByText('صفحة 1 من 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'السابق' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'التالي' }));
    expect(onPageChange).toHaveBeenCalledWith(2);

    rerender(<Pagination page={3} pageSize={20} total={45} onPageChange={onPageChange} />);
    expect(screen.getByRole('button', { name: 'التالي' })).toBeDisabled();
  });

  it('shows nothing when everything fits on one page', () => {
    render(<Pagination page={1} pageSize={20} total={7} onPageChange={vi.fn()} />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});

describe('SearchInput', () => {
  it('searches once typing pauses, with the trimmed text', () => {
    vi.useFakeTimers();
    try {
      const onSearch = vi.fn();
      render(<SearchInput label="دور" onSearch={onSearch} />);
      const box = screen.getByRole('searchbox', { name: 'دور' });
      fireEvent.change(box, { target: { value: 'مو' } });
      fireEvent.change(box, { target: { value: ' منى ' } });
      act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1));
      expect(onSearch).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(onSearch).toHaveBeenCalledExactlyOnceWith('منى');
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts from the default value without searching again', () => {
    vi.useFakeTimers();
    try {
      const onSearch = vi.fn();
      render(<SearchInput label="دور" defaultValue="منى" onSearch={onSearch} />);
      expect(screen.getByRole('searchbox')).toHaveValue('منى');
      act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2));
      expect(onSearch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ToggleGroup and DetailList', () => {
  it('ToggleGroup picks one option', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <ToggleGroup type="single" value="all" onValueChange={onValueChange} aria-label="الحالة">
        <ToggleGroupItem value="all">الكل</ToggleGroupItem>
        <ToggleGroupItem value="active">شغالين</ToggleGroupItem>
      </ToggleGroup>,
    );
    await user.click(screen.getByRole('radio', { name: 'شغالين' }));
    expect(onValueChange).toHaveBeenCalledWith('active');
  });

  it('DetailList shows a dash for an empty value', () => {
    render(
      <DetailList
        items={[
          { label: 'الايميل', value: 'mona@kidzzy.test', dir: 'ltr' },
          { label: 'الموبايل', value: null },
        ]}
      />,
    );
    expect(screen.getByText('الايميل').nextSibling).toHaveTextContent('mona@kidzzy.test');
    expect(screen.getByText('الموبايل').nextSibling).toHaveTextContent('—');
  });
});
