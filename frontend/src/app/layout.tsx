import type { Metadata } from "next";
import { Courier_Prime, IM_Fell_English } from "next/font/google";
import { t } from "@/lib/i18n";
import "./globals.css";

const courier = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], variable: "--font-courier" });
const fell = IM_Fell_English({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-fell-english" });

export const metadata: Metadata = {
  title: t("meta.title"),
  description: t("meta.description"),
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${courier.variable} ${fell.variable}`}>
      <body>{children}</body>
    </html>
  );
}
