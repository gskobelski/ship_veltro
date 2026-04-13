"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { cn } from "@/lib/utils";
import { BarChart3, FileText, LogOut, Ship, Truck, Users } from "lucide-react";

interface Props {
  orgSlug: string;
  orgName: string;
}

export function Sidebar({ orgSlug, orgName }: Props) {
  const pathname = usePathname();

  const navItems = [
    { href: `/${orgSlug}/sprzedaz`, label: "Sprzedaż", icon: FileText },
    { href: `/${orgSlug}/przesylki`, label: "Przesyłki", icon: Truck },
    { href: `/${orgSlug}/klienci`, label: "Klienci", icon: Users },
    { href: `/${orgSlug}/zestawienia`, label: "Zestawienia", icon: BarChart3 },
  ];

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Ship className="h-6 w-6 text-blue-600" />
          <span className="font-bold text-gray-900 text-lg">ship.veltro</span>
        </div>
        <p className="text-xs text-gray-500 mt-1 truncate">{orgName}</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              pathname.startsWith(href)
                ? "bg-blue-50 text-blue-700"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-gray-200">
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Wyloguj
          </button>
        </form>
      </div>
    </aside>
  );
}
