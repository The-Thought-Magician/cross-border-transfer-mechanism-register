'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth/client'

type NavItem = { label: string; href: string }
type NavSection = { title: string; items: NavItem[] }

const SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Coverage Scorecard', href: '/dashboard/coverage' },
    ],
  },
  {
    title: 'Register',
    items: [
      { label: 'Transfer Flows', href: '/dashboard/flows' },
      { label: 'Mechanisms', href: '/dashboard/mechanisms' },
      { label: 'SCC Tracker', href: '/dashboard/scc' },
      { label: 'Onward Transfers', href: '/dashboard/onward' },
    ],
  },
  {
    title: 'Assessments',
    items: [
      { label: 'TIAs', href: '/dashboard/tias' },
      { label: 'Reviews', href: '/dashboard/reviews' },
    ],
  },
  {
    title: 'Geography',
    items: [
      { label: 'Adequacy Tracker', href: '/dashboard/adequacy' },
      { label: 'Recipients', href: '/dashboard/recipients' },
    ],
  },
  {
    title: 'Remediation',
    items: [
      { label: 'Gaps & Tasks', href: '/dashboard/gaps' },
      { label: 'Notifications', href: '/dashboard/notifications' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { label: 'Data Categories', href: '/dashboard/data-categories' },
      { label: 'Subject Categories', href: '/dashboard/subject-categories' },
      { label: 'Legal Bases', href: '/dashboard/legal-bases' },
      { label: 'Supplementary Measures', href: '/dashboard/measures' },
    ],
  },
  {
    title: 'Records',
    items: [
      { label: 'Reports & Export', href: '/dashboard/reports' },
      { label: 'Audit Log', href: '/dashboard/audit' },
    ],
  },
  {
    title: 'Account',
    items: [{ label: 'Settings', href: '/dashboard/settings' }],
  },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    authClient.getSession().then((s: any) => {
      if (!mounted) return
      if (!s?.data?.user) {
        router.push('/auth/sign-in')
        return
      }
      setReady(true)
    })
    return () => {
      mounted = false
    }
  }, [router])

  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  const signOut = async () => {
    await authClient.signOut()
    router.push('/')
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-400" />
      </div>
    )
  }

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
          CB
        </span>
        <span className="text-sm font-semibold leading-tight text-white">
          CrossBorderTransfer
          <br />
          <span className="text-slate-400">MechanismRegister</span>
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {SECTIONS.map((section) => (
          <div key={section.title} className="mb-5">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
              {section.title}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`block rounded-lg px-3 py-1.5 text-sm transition-colors ${
                        active
                          ? 'bg-indigo-600/15 font-medium text-indigo-300'
                          : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )

  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-800 bg-slate-900/40 lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/70" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-slate-800 bg-slate-900">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/40 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              ☰
            </button>
            <span className="text-sm font-medium text-slate-300">Transfer Mechanism Register</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/notifications"
              className="text-sm text-slate-400 hover:text-white"
            >
              Alerts
            </Link>
            <button
              onClick={signOut}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
