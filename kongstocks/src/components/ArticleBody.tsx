import { RichText } from '@payloadcms/richtext-lexical/react'

export function ArticleBody({
  html,
  content,
}: {
  html?: string | null
  content?: unknown
}) {
  if (html?.trim()) {
    return <div className="ks-article-body" dangerouslySetInnerHTML={{ __html: html }} />
  }
  if (content) {
    return (
      <div className="ks-article-body">
        <RichText data={content as never} />
      </div>
    )
  }
  return <p>暫無內容。</p>
}
