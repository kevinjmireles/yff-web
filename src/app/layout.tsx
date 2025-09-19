import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Your Friend Fido - Personalized News & Civic Engagement",
  description: "Get personalized news based on your location and engage with your elected officials. Join the movement to bring journalism and civic life into the 21st century.",
  icons: {
    icon: '/Fido Logo.png',
    shortcut: '/Fido Logo.png',
    apple: '/Fido Logo.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
