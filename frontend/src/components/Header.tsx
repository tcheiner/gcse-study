import Link from "next/link";
import type { SubjectId } from "@/config/subjects";
import { t } from "@/lib/i18n";
import { KeyControl } from "./KeyControl";

export function Header({ subject }: { subject: SubjectId }) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="brand">
          <Link href={`/${subject}`} className="wordmark">{t("brand")}</Link>
          <span className="subject-tag">{t(`subjects.${subject}`)}</span>
        </div>
        <KeyControl />
      </div>
    </header>
  );
}
