import type { Metadata } from 'next'
import Link from 'next/link'
import { Inter } from 'next/font/google'
import Elva9Logo from '@/components/Elva9Logo'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'elva9 - Tävlingskoll',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body className={`${inter.className} min-h-screen`}>
        <div className="flex min-h-screen flex-col">
          <header className="px-4 py-2 sm:px-6 sm:py-3">
            <div className="mx-auto flex max-w-6xl justify-center">
              <Link
                href="/"
                data-testid="site-header-logo"
                aria-label="Till startsidan"
                className="rounded-lg transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <Elva9Logo className="justify-center text-base sm:text-lg" />
              </Link>
            </div>
          </header>
          <div className="flex-1">{children}</div>
          <footer className="px-4 pb-6 pt-3 sm:px-6 sm:pb-8 sm:pt-4">
            <div className="mx-auto max-w-6xl border-t border-line/60 pt-3 sm:pt-4">
              <div className="mx-auto flex max-w-3xl flex-col items-center gap-1.5 text-center text-xs text-muted">
                <p data-testid="site-footer-attribution" className="mx-auto max-w-xl leading-5">
                  Byggd med kärlek och entusiasm till pingis av två utvecklare i Stenungsund.
                  <br />
                  Har du frågor eller förslag? Hör av dig!
                </p>
                <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 leading-5">
                  <a
                    href="mailto:simon@joshi.se"
                    className="text-brand underline-offset-2 transition-colors duration-150 hover:text-brand-hover hover:underline"
                  >
                    Simon Ebeling
                  </a>
                  <span aria-hidden="true" className="text-muted">·</span>
                  <a
                    href="mailto:martin.lassbo@gmail.com"
                    className="text-brand underline-offset-2 transition-colors duration-150 hover:text-brand-hover hover:underline"
                  >
                    Martin Lassbo
                  </a>
                  <span aria-hidden="true" className="text-muted">·</span>
                  <a
                    data-testid="site-footer-email"
                    href="mailto:stenungsundsbtf@gmail.com"
                    className="text-brand underline-offset-2 transition-colors duration-150 hover:text-brand-hover hover:underline"
                  >
                    Stenungsunds BTF
                  </a>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}
