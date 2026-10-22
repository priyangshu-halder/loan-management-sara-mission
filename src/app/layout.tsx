import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Financial Management System",
  description: "Secure, auditable multi-tenant loan and financial management platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen flex flex-col">{children}</body>
    </html>
  );
}

