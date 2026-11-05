import { appConfig } from "@/config/app";
import { t } from "@/lib/i18n";

export function Footer() {
  return (
    <footer className="footer screen-only">
      <p>{t("footer.copyright", { year: appConfig.copyrightYear })}</p>
    </footer>
  );
}
