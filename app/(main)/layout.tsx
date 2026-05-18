import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'CXR-Lab - File Sharing System',
  description: 'A free, modern, open source file upload platform',
}

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
