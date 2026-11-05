import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { KeyProvider } from "@/components/KeyContext";
import { themeStyle } from "@/config/subjects";
import { t } from "@/lib/i18n";

export default function EnglishLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={themeStyle("english") as React.CSSProperties}>
      <a className="skip" href="#main">{t("nav.skip")}</a>
      <KeyProvider>
        <Header subject="english" />
        {children}
        <Footer />
      </KeyProvider>
    </div>
  );
}
