import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Salon At Home // Admin",
  description: "Operations dashboard for the Salon At Home MVP",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
