export const metadata = {
  title: "With Sentry 10.51.0",
  description: "Minimal with-sentry config pinned to @sentry/nextjs@10.51.0",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
