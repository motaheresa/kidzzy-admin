import { Card, CardContent, PageHeader } from '@/components/ui';
import { CreateInstructorForm } from '@/features/instructors';

/** /instructors/new: create an instructor account. Composition only. */
export function NewInstructorPage() {
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <PageHeader
        title="مدرس جديد"
        description="المدرس هيدخل بالايميل او الموبايل وكلمة السر المؤقتة، وبعدين يغيرها."
      />
      <Card>
        <CardContent>
          <CreateInstructorForm />
        </CardContent>
      </Card>
    </div>
  );
}
