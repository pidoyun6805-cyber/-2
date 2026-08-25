import type { Metadata } from "next";
import { Jua, Nanum_Pen_Script, IBM_Plex_Sans_KR, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// 보딩패스 디자인: Jua=두꺼운 라운드 제목, Nanum Pen Script=손글씨 목적지명,
// IBM Plex Sans KR=본문, IBM Plex Mono=티켓 메타데이터/숫자(tabular).
const jua = Jua({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

const penScript = Nanum_Pen_Script({
  variable: "--font-script",
  subsets: ["latin"],
  weight: "400",
});

const plexSansKr = IBM_Plex_Sans_KR({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "여행지수",
  description: "실제 데이터로 계산하는 다음 여행",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${jua.variable} ${penScript.variable} ${plexSansKr.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
