import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { WriteView, type Draft } from "@/components/WriteView";

function Harness({ onSubmit = () => {} }: { onSubmit?: () => void }) {
  const [draft, setDraft] = useState<Draft>({ board: "edexcel-igcse", marks: 12, target: 15, question: "", answer: "" });
  return (
    <WriteView boards={[{ id: "edexcel-igcse", name: "Pearson Edexcel International GCSE", specification: "", paper: 2, tariffs: [6, 9, 12], status: "draft" }]}
               draft={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} seconds={0} running={false}
               onToggleTimer={() => {}} onResetTimer={() => {}} onSubmit={onSubmit} busy={false} error={null} />
  );
}

describe("WriteView", () => {
  it("counts words live and selects a tariff", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Your answer"), "The writer builds tension slowly");
    expect(screen.getByText("5 words")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "9 marks" }));
    expect(screen.getByRole("radio", { name: "9 marks" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/for a 9-mark question/)).toBeInTheDocument();
  });

  it("submits via the button", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /submit for marking/i }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
