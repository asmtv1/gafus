import { EditQuestion } from "@/features/questions/EditQuestion";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <EditQuestion id={(await params).id} />;
}
