import './globals.css';

export const metadata = {
  title: 'Dial Tracker',
  description: 'Cold call accountability tracker',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0b0c',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
