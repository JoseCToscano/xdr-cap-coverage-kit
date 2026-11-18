"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Live" },
  { href: "/findings/", label: "Findings" },
  { href: "/backfill/", label: "Backfill" },
  { href: "/coverage/", label: "Coverage" },
  { href: "/reproduce/", label: "Reproduce" },
];

export function Nav() {
  const path = usePathname() || "/";
  const norm = path.endsWith("/") ? path : path + "/";
  return (
    <nav className="nav" aria-label="Sections">
      <ul>
        {LINKS.map((l) => {
          const on = l.href === "/" ? norm === "/" : norm.startsWith(l.href);
          return (
            <li key={l.href}>
              <Link href={l.href} aria-current={on ? "page" : undefined} className={on ? "on" : undefined}>{l.label}</Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
