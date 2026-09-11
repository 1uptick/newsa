import React from 'react'
import Link from 'next/link'
import { DefaultTemplate } from '@payloadcms/next/templates'
import type { AdminViewServerProps } from 'payload'
import { Gutter } from '@payloadcms/ui'
import { BrandUploadForm } from '@/components/BrandUploadForm'
import { getTheme } from '@/lib/theme'
import { themeToCssVars } from '@/design-system/tokens'
import '@/design-system/tokens.css'

export async function BrandPanel({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const theme = await getTheme()
  const vars = themeToCssVars(theme)

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
          <h1 style={{ margin: '16px 0 8px' }}>Logo / Favicon</h1>
          <p style={{ maxWidth: 720 }}>
            更換後即時套用到公開站的頁首與瀏覽器分頁圖示。未上傳時使用 <code>/logo.png</code> 與{' '}
            <code>/favicon.ico</code>。
          </p>
          <p>
            <Link href="/admin/globals/theme">也可在「設計系統 / 網站設定 → 品牌」編輯 →</Link>
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 24,
              marginTop: 24,
            }}
          >
            <section style={{ border: '1px solid var(--ks-line)', padding: 16 }}>
              <h2 style={{ marginTop: 0 }}>Logo</h2>
              <p className="ks-meta">頁首左側。建議透明底 PNG。</p>
              <div
                style={{
                  background: 'var(--ks-header)',
                  padding: '16px 20px',
                  margin: '12px 0 16px',
                  minHeight: 64,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <img src={theme.logoUrl} alt={theme.siteName} style={{ height: 28, width: 'auto' }} />
              </div>
              <BrandUploadForm field="logo" label="Logo" accept="image/png,image/svg+xml,image/webp,image/jpeg" />
            </section>

            <section style={{ border: '1px solid var(--ks-line)', padding: 16 }}>
              <h2 style={{ marginTop: 0 }}>Favicon</h2>
              <p className="ks-meta">瀏覽器分頁與 Apple 圖示。建議 180×180 PNG 或 ICO。</p>
              <div
                style={{
                  background: '#f4f4f4',
                  padding: 16,
                  margin: '12px 0 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <img src={theme.faviconUrl} alt="" width={32} height={32} style={{ objectFit: 'contain' }} />
                <img src={theme.faviconUrl} alt="" width={64} height={64} style={{ objectFit: 'contain' }} />
              </div>
              <BrandUploadForm
                field="favicon"
                label="Favicon"
                accept="image/png,image/x-icon,image/vnd.microsoft.icon,.ico,image/webp,image/jpeg"
              />
            </section>
          </div>
        </div>
      </Gutter>
    </DefaultTemplate>
  )
}

export default BrandPanel
