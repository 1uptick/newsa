import React from 'react'
import Link from 'next/link'

export function DesignSystemNavLink() {
  return (
    <div style={{ padding: '8px 0 16px' }}>
      <Link
        href="/admin/design-system"
        style={{
          display: 'block',
          padding: '8px 16px',
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        設計系統
      </Link>
      <Link
        href="/admin/globals/theme"
        style={{ display: 'block', padding: '4px 16px', fontSize: 13, opacity: 0.8 }}
      >
        自訂顏色
      </Link>
    </div>
  )
}
