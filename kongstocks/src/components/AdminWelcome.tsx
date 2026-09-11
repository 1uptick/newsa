import React from 'react'

export function AdminWelcome() {
  return (
    <div
      style={{
        marginBottom: 24,
        padding: '16px 20px',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 8,
      }}
    >
      <h2 style={{ margin: '0 0 8px' }}>KongStocks CMS</h2>
      <p style={{ margin: 0, maxWidth: 640 }}>
        在這裡撰寫及發布文章、頁面、分類與網站導覽。草稿可先存再發布。公開網站讀取已發布內容；n8n
        可用 <code>POST /api/n8n/posts</code> 建立文章。
      </p>
    </div>
  )
}
