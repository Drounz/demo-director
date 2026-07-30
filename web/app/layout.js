export const metadata = {
  title: 'Demo Director',
  description: 'Describe a demo in plain English, get a live-playable script for screen recording.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0b0f19', color: '#e5e7eb',
        fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
