import Link from "next/link";
import { Header } from "@/components/Header";
import { englishPapers, paperPath, type PaperRoute } from "@/config/papers";
import { subjects, themeStyle, type SubjectId } from "@/config/subjects";
import { t } from "@/lib/i18n";

/** Papers available per subject. Only English has any so far. */
const papersBySubject: Partial<Record<SubjectId, PaperRoute[]>> = { english: englishPapers };

const ArrowIcon = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
);

/** Landing page: find the subject, board, paper and section to practise. */
export default function Home() {
  const ids = Object.keys(subjects) as SubjectId[];
  return (
    <>
      <Header />
      <main id="main" className="shell page">
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 760 }}>
          <span className="kicker">{t("home.kicker")}</span>
          <h1 className="display">{t("home.titleA")}<br /><em>{t("home.titleB")}</em></h1>
          <p style={{ margin: 0, color: "var(--text-2)" }}>{t("home.intro")}</p>
        </div>

        <ul aria-label={t("home.subjectsLabel")} className="subject-grid">
          {ids.map((id) => {
            const papers = papersBySubject[id] ?? [];
            const live = subjects[id].enabled && papers.length > 0;
            return (
              <li key={id} className={`sheet subject-card${live ? "" : " soon"}`} style={themeStyle(id) as React.CSSProperties}>
                <div className="between" style={{ alignItems: "baseline" }}>
                  <h2 className="h2" style={{ color: "var(--ink)" }}>{t(`subjects.${id}`)}</h2>
                  {!live && <span className="stamp-mini" style={{ color: "var(--faint)" }}>{t("home.soon")}</span>}
                </div>
                {papers.map((p) => (
                  <div key={paperPath(p)} className="paper-entry">
                    <p className="label" style={{ margin: 0 }}>{t(`papers.${p.labelKey}.board`)}</p>
                    <p className="fell" style={{ margin: 0, fontSize: 20 }}>{t(`papers.${p.labelKey}.paper`)}</p>
                    <div className="section-row">
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                        <strong className="fell" style={{ fontWeight: 400, fontSize: 24, color: "var(--ink)" }}>{t(`papers.${p.labelKey}.section`)}</strong>
                        <span style={{ color: "var(--text-2)" }}>{t(`papers.${p.labelKey}.summary`)}</span>
                        <span className="muted" style={{ fontSize: 13, letterSpacing: ".12em", textTransform: "uppercase" }}>{t(`papers.${p.labelKey}.marks`)}</span>
                      </div>
                      <Link href={paperPath(p)} className="btn">{t("home.start")}<ArrowIcon /></Link>
                    </div>
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
