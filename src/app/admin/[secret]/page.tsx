import { notFound } from "next/navigation";
import { listCouples } from "@/actions/admin";
import { AdminClient } from "./client";

interface PageProps {
  params: Promise<{ secret: string }>;
}

export default async function AdminPage({ params }: PageProps) {
  const { secret } = await params;

  if (secret !== process.env.ADMIN_SECRET) {
    notFound();
  }

  const couples = await listCouples();

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-6">
          Admin Panel
        </h1>
        <AdminClient initialCouples={couples} adminSecret={secret} />
      </div>
    </div>
  );
}
