import { notFound } from "next/navigation";
import { connection } from "next/server";
import { areDevRoutesEnabled } from "@/config/dev-routes";

export default async function DevLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  if (!areDevRoutesEnabled()) {
    notFound();
  }
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      {children}
    </main>
  );
}
