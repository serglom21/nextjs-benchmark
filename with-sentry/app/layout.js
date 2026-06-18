export const metadata = {
  title: "With Sentry",
  description: "Minimal Next.js app with Sentry initialized",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
