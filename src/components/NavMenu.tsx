"use client";

import { useState } from "react";
import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";

export interface NavUser {
  username: string;
  role: "MANAGER" | "ADMIN";
}

export default function NavMenu({ user }: { user: NavUser | null }) {
  const [open, setOpen] = useState(false);

  if (!user) {
    return (
      <nav className="flex items-center gap-2 text-sm">
        <NavLink href="/login">Log in</NavLink>
        <Link
          href="/sign-up"
          className="rounded-md bg-gold px-3 py-2 font-semibold text-pitch-dark hover:brightness-95"
        >
          Sign up
        </Link>
      </nav>
    );
  }

  return (
    <>
      {/* Desktop inline nav */}
      <nav className="hidden items-center gap-1 text-sm sm:flex">
        <NavLink href="/dashboard">Dashboard</NavLink>
        <NavLink href="/team">My Team</NavLink>
        <NavLink href="/league">League</NavLink>
        <NavLink href="/stats">Stats</NavLink>
        {user.role === "ADMIN" && <NavLink href="/admin">Admin</NavLink>}
        <form action={logoutAction}>
          <button
            type="submit"
            className="ml-2 rounded-md px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white"
          >
            Log out
          </button>
        </form>
      </nav>

      {/* Mobile hamburger toggle */}
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-md text-white sm:hidden"
      >
        <span className="text-2xl leading-none">{open ? "✕" : "☰"}</span>
      </button>

      {open && (
        <nav className="absolute inset-x-0 top-full z-40 flex flex-col gap-1 border-b border-card-border bg-pitch-dark p-3 text-sm sm:hidden">
          <MobileLink href="/dashboard" onNavigate={() => setOpen(false)}>
            Dashboard
          </MobileLink>
          <MobileLink href="/team" onNavigate={() => setOpen(false)}>
            My Team
          </MobileLink>
          <MobileLink href="/league" onNavigate={() => setOpen(false)}>
            League
          </MobileLink>
          <MobileLink href="/stats" onNavigate={() => setOpen(false)}>
            Stats
          </MobileLink>
          {user.role === "ADMIN" && (
            <MobileLink href="/admin" onNavigate={() => setOpen(false)}>
              Admin
            </MobileLink>
          )}
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full rounded-md px-3 py-2.5 text-left text-white/80 hover:bg-white/10 hover:text-white"
            >
              Log out
            </button>
          </form>
        </nav>
      )}
    </>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white"
    >
      {children}
    </Link>
  );
}

function MobileLink({
  href,
  children,
  onNavigate,
}: {
  href: string;
  children: React.ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="rounded-md px-3 py-2.5 text-white/80 hover:bg-white/10 hover:text-white"
    >
      {children}
    </Link>
  );
}
