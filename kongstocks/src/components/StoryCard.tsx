import Link from 'next/link'
import { Kicker } from './Kicker'

export function StoryCard({
  href,
  title,
  kicker,
  time,
  excerpt,
  lead = false,
}: {
  href: string
  title: string
  kicker?: string
  time?: string
  excerpt?: string | null
  lead?: boolean
}) {
  const Heading = lead ? 'h2' : 'h3'
  return (
    <article className={lead ? 'ks-lead' : 'ks-card'}>
      {kicker ? <Kicker>{kicker}</Kicker> : null}
      <Heading>
        <Link href={href}>{title}</Link>
      </Heading>
      {time ? <div className="ks-meta">{time}</div> : null}
      {excerpt ? <p>{excerpt}</p> : null}
    </article>
  )
}
