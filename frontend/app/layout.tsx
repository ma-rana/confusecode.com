import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ConfuseCode — learn debugging, not copy-pasting",
  description:
    "A learning-focused code reviewer for JavaScript & TypeScript. It finds issues and explains why they matter — you fix them yourself. Your code is analyzed and never stored.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
