import './globals.css'

export const metadata = {
  title: 'ARIX Tree - Signature Collection',
  description: 'A luxurious 3D interactive Christmas tree experience',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
