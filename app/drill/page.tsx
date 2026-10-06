import Drill from "@/components/Drill";
import { auth } from "@/auth";

export default async function DrillPage() {
  const session = await auth();
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-8">
      <Drill signedIn={!!session?.user?.id} />
    </main>
  );
}
