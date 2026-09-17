import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Al-Idrisi Atelier — Globe Gore Studio",
  description:
    "Turn your world map into precisely sized, high-resolution globe gores. An English and Arabic cartographic atelier.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
