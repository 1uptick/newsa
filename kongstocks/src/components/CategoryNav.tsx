'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function CategoryNav({ items }: { items: { label: string; href: string }[] }) {
  const pathname = usePathname() || '/'
  return (
    <nav className="ks-catnav" aria-label="分類">
      <div className="ks-wrap ks-catnav-inner">
        {items.map((item) => {
          const current = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link key={item.href} href={item.href} aria-current={current ? 'page' : undefined}>
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
