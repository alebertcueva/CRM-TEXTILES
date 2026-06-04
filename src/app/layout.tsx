import type { Metadata, Viewport } from 'next'
import NavBar from './components/NavBar'
import './globals.css'

export const metadata: Metadata = {
  title: 'A.Bert — CRM Textiles',
  description: 'Control de ventas y producción textil A.Bert',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'A.Bert',
  },
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <NavBar />
        <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
          {children}
        </main>
      </body>
    </html>
  )
}
