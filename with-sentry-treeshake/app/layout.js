export const metadata = {
  title: "With Sentry (Actual + removeTracing)",
  description: "Customer config with __SENTRY_TRACING__=false tree-shaking fix",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
