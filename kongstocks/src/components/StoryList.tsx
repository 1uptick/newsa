import { StoryCard } from './StoryCard'

type Item = {
  href: string
  title: string
  kicker?: string
  time?: string
  image?: string
}

export function StoryList({ title, items }: { title: string; items: Item[] }) {
  return (
    <section className="ks-list">
      <h2 className="ks-section-title">{title}</h2>
      {items.map((item) => (
        <div className="ks-list-item" key={item.href}>
          <StoryCard {...item} />
        </div>
      ))}
    </section>
  )
}
