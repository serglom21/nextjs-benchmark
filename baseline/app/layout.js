export const metadata = {
  title: "Baseline",
  description: "Minimal Next.js app with no Sentry",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
