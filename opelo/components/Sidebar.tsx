"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { AppIcon, AppIconName } from "@/components/AppIcon";

const nav = [
  { href: "/dashboard", label: "Home", icon: "overview" },
  { href: "/inbox",     label: "Messages", icon: "inbox" },
  { href: "/policies",  label: "My Rules",  icon: "rules" },
  { href: "/logs",      label: "Activity",  icon: "activity" },
] satisfies { href: string; label: string; icon: AppIconName }[];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-full shrink-0 border-b border-stone-100 bg-white md:sticky md:top-0 md:flex md:h-screen md:min-h-screen md:w-56 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
      {/* Logo at top */}
      <div className="flex items-center justify-between border-stone-100 px-4 py-4 md:block md:border-b md:px-5 md:py-5">
        <Link href="/">
          <img src="/opelo-logo.svg" alt="Opelo" className="h-auto w-16 md:w-20" />
        </Link>
      </div>
      {/* Nav items */}
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:flex-1 md:space-y-0.5 md:overflow-visible md:p-3 md:pt-4">
        <p className="hidden px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400 md:block">Main</p>
        {nav.map(item => {
          const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}
              className={clsx(
                "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition md:gap-3",
                active ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
              )}
            >
              <AppIcon name={item.icon} className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto hidden border-t border-stone-100 p-3 md:block">
        <Link href="/" className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-stone-500 hover:text-stone-800 hover:bg-stone-50 transition">
          <AppIcon name="back" className="h-4 w-4" />
          Home
        </Link>
      </div>
    </aside>
  );
}
