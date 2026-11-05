import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EnglishStudio } from "@/components/EnglishStudio";
import { englishPapers, findPaper } from "@/config/papers";

type Params = { board: string; paper: string; section: string };

export function generateStaticParams(): Params[] {
  return englishPapers.map(({ board, paper, section }) => ({ board, paper, section }));
}

// With Partial Prefetching, params are awaited inside <Suspense> so the shell can prerender.
export default function PaperPage({ params }: { params: Promise<Params> }) {
  return (
    <Suspense fallback={null}>
      <Paper params={params} />
    </Suspense>
  );
}

async function Paper({ params }: { params: Promise<Params> }) {
  const { board, paper, section } = await params;
  const route = findPaper(board, paper, section);
  if (!route) notFound();
  return <EnglishStudio boardId={route.boardId} />;
}
