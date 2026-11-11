"use client";

import Link from "next/link";
import { ChevronsUpDownIcon, CreditCardIcon, LogOutIcon } from "lucide-react";
import { useSignOut } from "@/components/auth/use-sign-out";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { initials } from "@/lib/initials";

export type ShellUser = {
  name: string;
  plan: string;
  email?: string | null;
  image?: string | null;
};

export function UserMenu({ user }: { user: ShellUser }) {
  const { signOut, pending } = useSignOut();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            size="lg"
            className="border bg-card"
            aria-label="Account menu"
          />
        }
      >
        <Avatar className="size-8">
          {user.image ? <AvatarImage src={user.image} alt="" /> : null}
          <AvatarFallback>{initials(user.name)}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-medium">{user.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {user.plan}
          </span>
        </span>
        <ChevronsUpDownIcon className="ml-auto text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col">
            <span className="truncate font-medium text-foreground">
              {user.name}
            </span>
            {user.email ? (
              <span className="truncate font-normal">{user.email}</span>
            ) : null}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/usage" />}>
            <CreditCardIcon />
            Usage & credits
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={pending}
            closeOnClick={false}
            onClick={signOut}
          >
            {pending ? <Spinner aria-hidden /> : <LogOutIcon />}
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
