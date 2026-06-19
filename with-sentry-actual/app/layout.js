export const metadata = {
  title: "With Sentry (Actual customer config)",
  description: "Mirrors the customer's real client-side Sentry setup",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
