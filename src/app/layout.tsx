import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'TTAttendance',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body className={`${inter.className} min-h-screen`}>
        <div className="flex min-h-screen flex-col">
          <div className="flex-1">{children}</div>
          <footer className="border-t border-line/70 bg-surface/80 px-4 py-5 backdrop-blur-sm sm:px-6">
            <div className="mx-auto flex max-w-5xl flex-col gap-1 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
              <p data-testid="site-footer-attribution">
                Den här programvaran skapades av Stenungsunds Bordtennisklubb.
              </p>
              <a
                data-testid="site-footer-email"
                href="mailto:stenungsundsbtf@gmail.com"
                className="font-medium text-brand transition-colors duration-150 hover:text-brand-hover hover:underline"
              >
                Kontakt: stenungsundsbtf@gmail.com
              </a>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}
