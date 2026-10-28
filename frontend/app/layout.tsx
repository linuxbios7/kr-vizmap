import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KR Market Map",
  description: "KOSPI·KOSDAQ 시가총액 트리맵",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
