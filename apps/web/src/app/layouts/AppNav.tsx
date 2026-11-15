import {
  BarChart3Icon,
  BellRingIcon,
  GraduationCapIcon,
  HistoryIcon,
  HouseIcon,
  PresentationIcon,
  UsersRoundIcon,
  WalletIcon,
} from 'lucide-react';
import { SectionNav, type SectionNavItem } from './SectionNav';

/** The main sections, in the wireframe's order. A new screen adds its link here. */
const NAV_ITEMS: SectionNavItem[] = [
  { to: '/', label: 'الرئيسية', icon: HouseIcon, end: true },
  { to: '/groups', label: 'الجروبات', icon: UsersRoundIcon, permission: 'groups.read' },
  { to: '/students', label: 'الطلاب', icon: GraduationCapIcon, permission: 'students.read' },
  { to: '/instructors', label: 'المدرسين', icon: PresentationIcon, permission: 'instructors.read' },
  {
    to: '/payments',
    label: 'المدفوعات',
    icon: WalletIcon,
    permission: 'payments.read',
    scope: 'any',
  },
  {
    to: '/reports',
    label: 'التقارير',
    icon: BarChart3Icon,
    permission: 'reports.read',
    scope: 'any',
  },
  {
    to: '/audit-log',
    label: 'سجل التغييرات',
    icon: HistoryIcon,
    permission: 'audit.read',
    scope: 'any',
  },
  {
    to: '/reminder-rules',
    label: 'قواعد التذكير',
    icon: BellRingIcon,
    permission: 'reminders.manage',
    scope: 'any',
  },
];

/**
 * The app's main navigation, under the header: the shared SectionNav (icons across the top, the
 * label from `sm` up) with the app's sections, at the width of the app's content.
 */
export function AppNav() {
  return <SectionNav label="الأقسام" items={NAV_ITEMS} maxWidth="max-w-5xl" />;
}
