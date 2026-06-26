import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'
import StageBar from '@/components/layout/StageBar'

export const metadata: Metadata = {
  title: 'TestFlow',
  description: 'QA Test Case Management',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Sidebar />
        <div className="main">
          <Topbar />
          <StageBar />
          <div className="content">{children}</div>
        </div>
      </body>
    </html>
  )
}
