import React from 'react'
import Link from 'next/link'
import { DefaultTemplate } from '@payloadcms/next/templates'
import type { AdminViewServerProps } from 'payload'
import { Gutter } from '@payloadcms/ui'
import '@/design-system/tokens.css'
import { DEFAULT_THEME, themeToCssVars } from '@/design-system/tokens'

export function DesignSystemPanel({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const vars = themeToCssVars(DEFAULT_THEME)
  return (
    <DefaultTemplate
      i18n={initPageResult.req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={initPageResult.req.payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={initPageResult.req.user || undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>
        <div style={{ ...vars, fontFamily: 'var(--ks-sans)', paddingBottom: 48 } as React.CSSProperties}>
          <h1 style={{ margin: '16px 0 8px' }}>KongStocks 設計系統</h1>
          <p style={{ maxWidth: 720 }}>
            Bloomberg 新聞版面 + 現站主色 <code>#E3338F</code>（kongstocks.com{' '}
            <code>--main-color-one</code>）。字型為本機 Noto Sans / Serif（繁體 + 简体），不經 CDN。
          </p>
          <p>
            <Link href="/admin/globals/theme">開啟自訂（顏色、導覽、密度） →</Link>
          </p>

          <h2>顏色</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              ['Accent', 'var(--ks-accent)'],
              ['Header', 'var(--ks-header)'],
              ['Ink', 'var(--ks-ink)'],
              ['Up', 'var(--ks-up)'],
              ['Down', 'var(--ks-down)'],
            ].map(([label, color]) => (
              <div key={label}>
                <div className="ks-swatch" style={{ background: color }} />
                <div className="ks-meta">{label}</div>
              </div>
            ))}
          </div>

          <h2>字級 · 繁體</h2>
          <p className="ks-kicker">港股新聞</p>
          <p className="ks-type-sample" style={{ fontFamily: 'var(--ks-serif)', fontSize: 28, fontWeight: 700 }}>
            恒指收跌一百四十八點 市場觀望氣氛濃厚
          </p>
          <p className="ks-type-sample" style={{ fontFamily: 'var(--ks-serif)', fontSize: 16 }}>
            本欄所載內容僅為公開資訊之一般性觀察，並非投資建議。
          </p>

          <h2>字级 · 简体</h2>
          <p className="ks-kicker">港股新闻</p>
          <p className="ks-type-sample" style={{ fontFamily: 'var(--ks-serif)', fontSize: 28, fontWeight: 700 }}>
            恒指收跌一百四十八点 市场观望气氛浓厚
          </p>
          <p className="ks-type-sample" style={{ fontFamily: 'var(--ks-serif)', fontSize: 16 }}>
            本栏所载内容仅为公开信息之一般性观察，并非投资建议。
          </p>

          <h2>元件</h2>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button type="button" className="ks-btn">
              主要按鈕
            </button>
            <button type="button" className="ks-btn ks-btn-ghost">
              次要
            </button>
          </div>
          <article className="ks-card" style={{ maxWidth: 360 }}>
            <p className="ks-kicker">AI 選股</p>
            <h3 style={{ fontFamily: 'var(--ks-serif)' }}>電能實業擴展業務 股價接近近期高位</h3>
            <div className="ks-meta">9月11日 17:01</div>
          </article>
        </div>
      </Gutter>
    </DefaultTemplate>
  )
}

export default DesignSystemPanel
