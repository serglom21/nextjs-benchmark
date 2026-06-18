export const metadata = {
  title: "With Sentry (Deferred)",
  description: "Minimal Next.js app with Sentry.init deferred via setTimeout(0)",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
