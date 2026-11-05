import Link from "next/link";
import type { SubjectId } from "@/config/subjects";
import { t } from "@/lib/i18n";
import { KeyControl } from "./KeyControl";

/** Site header. Without a subject (the landing page) it shows only the wordmark. */
export function Header({ subject }: { subject?: SubjectId }) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="brand">
          <Link href="/" className="wordmark">{t("brand")}</Link>
          {subject && <span className="subject-tag">{t(`subjects.${subject}`)}</span>}
        </div>
        {subject && <KeyControl />}
      </div>
    </header>
  );
}
