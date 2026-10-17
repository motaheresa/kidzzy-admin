// Public API of the instructors feature (US-04). Pages import from here only (ESLint boundaries).
export { instructorKeys } from './api/instructors.keys';
export { CreateInstructorForm } from './components/CreateInstructorForm';
export { EditInstructorForm } from './components/EditInstructorForm';
export { InstructorDetails } from './components/InstructorDetails';
export { InstructorsList } from './components/InstructorsList';
export { useInstructorOptions } from './hooks/useInstructorOptions';
export type { Instructor, InstructorDetail } from './types';
