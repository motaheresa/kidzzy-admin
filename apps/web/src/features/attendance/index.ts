// Public API of the attendance feature (US-18, US-37, US-19). Pages and other features import
// from here only (ESLint boundaries).
export { AttendanceSection } from './components/AttendanceSection';
export { StarRating } from './components/StarRating';
export { useRefreshAttendance, useSessionAttendance } from './hooks/useAttendance';
export { GroupAttendanceGrid } from './components/GroupAttendanceGrid';
export { StudentAttendanceList } from './components/StudentAttendanceList';
