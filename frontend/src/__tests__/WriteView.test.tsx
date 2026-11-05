import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { WriteView, type Draft } from "@/components/WriteView";

const CAMBRIDGE = { id: "cambridge-0990", name: "Cambridge IGCSE First Language English", specification: "", paper: 2, tariffs: [40], status: "official" };
const MULTI = { id: "multi", name: "Multi-tariff board", specification: "", paper: 2, tariffs: [6, 9, 12], status: "draft" };

function Harness({ onSubmit = () => {}, board = CAMBRIDGE }: { onSubmit?: () => void; board?: typeof CAMBRIDGE }) {
  const [draft, setDraft] = useState<Draft>({ board: board.id, marks: board.tariffs.at(-1)!, target: 45, question: "", answer: "" });
  return (
    <WriteView boards={[board]}
               draft={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} seconds={0} running={false}
               onToggleTimer={() => {}} onResetTimer={() => {}} onSubmit={onSubmit} busy={false} error={null} />
  );
}

describe("WriteView", () => {
  it("counts words live and shows the fixed composition tariff", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Your answer"), "The clock stopped long ago");
    expect(screen.getByText("5 words")).toBeInTheDocument();
    expect(screen.getByText("Composition · 40 marks")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /marks/ })).toBeNull();
    expect(screen.getByText(/for a 40-mark composition/)).toBeInTheDocument();
  });

  it("offers a tariff picker when a board has several", async () => {
    const user = userEvent.setup();
    render(<Harness board={MULTI} />);
    await user.click(screen.getByRole("radio", { name: "9 marks" }));
    expect(screen.getByRole("radio", { name: "9 marks" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/for a 9-mark composition/)).toBeInTheDocument();
  });

  it("submits via the button", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /submit for marking/i }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
