import { SignOutButton } from "@/components/auth/sign-out-button";
import { Logo } from "@/components/brand";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/initials";
import { requireSession } from "@/server/session";

export default async function Home() {
  const { user } = await requireSession();

  return (
    <main className="flex flex-1 flex-col gap-8 p-6">
      <Logo />
      <div className="flex items-center gap-3">
        <Avatar>
          {user.image ? <AvatarImage src={user.image} alt="" /> : null}
          <AvatarFallback>{initials(user.name)}</AvatarFallback>
        </Avatar>
        <p className="text-sm">
          Signed in as <span className="font-medium">{user.name}</span>
        </p>
      </div>
      <div>
        <SignOutButton />
      </div>
    </main>
  );
}
