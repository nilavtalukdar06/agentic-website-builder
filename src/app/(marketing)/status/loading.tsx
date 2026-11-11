import { StatusSkeleton } from "./_components/status-view";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 pt-6 pb-16">
      <StatusSkeleton />
    </main>
  );
}
