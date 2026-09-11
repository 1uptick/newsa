'use client'

import { useState, type FormEvent } from 'react'

export function BrandUploadForm({
  field,
  label,
  accept,
}: {
  field: 'logo' | 'favicon'
  label: string
  accept: string
}) {
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const file = new FormData(form).get('file')
    if (!(file instanceof File) || !file.size) {
      setStatus('請先選擇檔案')
      return
    }

    setBusy(true)
    setStatus('上傳中…')
    try {
      const upload = new FormData()
      upload.append('file', file)
      upload.append('alt', label)
      const mediaRes = await fetch('/api/media?depth=0', {
        method: 'POST',
        body: upload,
        credentials: 'include',
      })
      const mediaJson = (await mediaRes.json()) as { doc?: { id?: number }; errors?: { message?: string }[] }
      if (!mediaRes.ok || !mediaJson.doc?.id) {
        throw new Error(mediaJson.errors?.[0]?.message || `上傳失敗 (${mediaRes.status})`)
      }

      const themeRes = await fetch('/api/globals/theme', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: mediaJson.doc.id }),
      })
      if (!themeRes.ok) {
        throw new Error(`無法更新網站設定 (${themeRes.status})`)
      }

      setStatus('已更新，正在重新載入…')
      window.location.reload()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '更新失敗')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 8 }}>
      <input name="file" type="file" accept={accept} disabled={busy} />
      <button type="submit" className="ks-btn" disabled={busy} style={{ width: 'fit-content' }}>
        {busy ? '處理中…' : `更換${label}`}
      </button>
      {status ? <div className="ks-meta">{status}</div> : null}
    </form>
  )
}
