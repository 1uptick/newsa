import type { ReactNode } from 'react'
import { CategoryNav } from '@/components/CategoryNav'
import { getTheme } from '@/lib/theme'

export async function PageShell({
  hero,
  children,
}: {
  hero?: ReactNode
  children: ReactNode
}) {
  const theme = await getTheme()
  return (
    <>
      {hero}
      <CategoryNav items={theme.nav} />
      <div className="ks-wrap">{children}</div>
    </>
  )
}
