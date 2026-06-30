'use client'
import { useEffect } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

export function Modal({ open, onClose, title, children, footer, className = '' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative z-10 w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 shadow-2xl ${className}`}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
            <h2 className="text-base font-semibold text-white">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-slate-500 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-slate-800 px-5 py-4">{footer}</div>}
      </div>
    </div>
  )
}
