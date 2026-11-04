import { redirect } from "next/navigation";

// Only English exists so far; the subject picker comes with the second subject.
export default function Home() {
  redirect("/english");
}
