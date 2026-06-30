import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CrossBorderTransferMechanismRegister',
  description: 'The Chapter V system of record: flows, mechanisms, TIAs, adequacy, and audit-ready export for cross-border data transfers.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased">{children}</body>
    </html>
  )
}
