import Link from 'next/link'
import { Kicker } from './Kicker'

export function StoryCard({
  href,
  title,
  kicker,
  time,
  excerpt,
  image,
  lead = false,
}: {
  href: string
  title: string
  kicker?: string
  time?: string
  excerpt?: string | null
  image?: string
  lead?: boolean
}) {
  const Heading = lead ? 'h2' : 'h3'
  const classes = [lead ? 'ks-lead' : 'ks-card', image ? 'ks-has-thumb' : ''].filter(Boolean).join(' ')
  return (
    <article className={classes}>
      {image ? (
        <Link href={href} className="ks-thumb" tabIndex={-1} aria-hidden="true">
          <img src={image} alt="" />
        </Link>
      ) : null}
      {kicker ? <Kicker>{kicker}</Kicker> : null}
      <Heading>
        <Link href={href}>{title}</Link>
      </Heading>
      {time ? <div className="ks-meta">{time}</div> : null}
      {excerpt ? <p>{excerpt}</p> : null}
    </article>
  )
}
