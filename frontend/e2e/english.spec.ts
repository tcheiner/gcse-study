import { expect, test } from "@playwright/test";
import { ANSWER, fillAnswer, json, mockBackend, QUESTION } from "./fixtures";

test("happy path: add key, get marked, see full-marks version", async ({ page }) => {
  const seen = await mockBackend(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/english$/);
  await expect(page.getByText("No key added")).toBeVisible();

  await fillAnswer(page);
  await expect(page.getByText(`${ANSWER.trim().split(/\s+/).length} words`, { exact: true })).toBeAttached();
  await expect(page.getByText("Composition · 40 marks")).toBeVisible();
  await page.getByRole("button", { name: /submit for marking/i }).click();

  // No key yet: the dialog opens, then marking continues automatically.
  const dialog = page.getByRole("dialog", { name: "Your Claude API key" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Paste your key").fill("sk-ant-test-key");
  await dialog.getByRole("button", { name: /check & seal/i }).click();

  await expect(page.getByRole("heading", { name: /22 \/ 40/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Key active · forgets in (19|20) min/)).toBeVisible();
  const grade = seen.find((r) => r.path === "/grade")!;
  expect(grade.body).toMatchObject({ board: "cambridge-0990", marks: 40, question: QUESTION });

  // The key field is cleared, and the key never appears in any request except /session/key.
  await expect(dialog).toBeHidden();
  expect(seen.filter((r) => JSON.stringify(r.body).includes("sk-ant-test-key")).map((r) => r.path)).toEqual(["/session/key"]);

  // Genre, both grids, the level drop and the two steps.
  await expect(page.getByText("Descriptive", { exact: true })).toBeVisible();
  await expect(page.getByText("Content & Structure: 9 / 16 · Level 4")).toBeVisible();
  await expect(page.getByText("Style & Accuracy: 13 / 24 · Level 4")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Level drop: a critical error" })).toBeVisible();
  await expect(page.getByText("Use a semicolon to balance past and present.")).toBeVisible();

  // Margin annotations highlight the student's own words.
  await expect(page.locator(".hl-strength", { hasText: "folded like a sleeper's" })).toBeVisible();
  await expect(page.locator(".hl-improve", { hasText: "grandad winding it" })).toBeVisible();
  await expect(page.getByText("This drifts into narrative: keep describing.")).toBeVisible();

  // Each grid has its own level track: select another level to read it.
  await page.getByRole("group", { name: "Style & Accuracy levels" }).getByRole("button", { name: "Level 6 · 21–24 marks" }).click();
  await expect(page.getByText("Precise words, almost always accurate.")).toBeVisible();

  await page.getByRole("button", { name: /show full-marks version/i }).click();
  await expect(page.locator(".hl-change", { hasText: "the pendulum hangs mid-swing" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("radio", { name: "Side by side" }).click();
  await expect(page.getByText("Your original · 22 / 40")).toBeVisible();

  await page.getByRole("button", { name: /back to my feedback/i }).click();
  await page.getByRole("button", { name: /back to my answer/i }).click();
  await expect(page.getByRole("textbox", { name: "Your answer", exact: true })).toHaveValue(/folded like a sleeper's/);
});

test("a rejected key shows the reason and nothing is marked", async ({ page }) => {
  const seen = await mockBackend(page, {
    addKey: (r) => json(r, 401, { code: "invalid_api_key", message: "nope" }),
  });
  await page.goto("/english");
  await page.getByRole("button", { name: "Add key" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Paste your key").fill("sk-ant-wrong");
  await dialog.getByRole("button", { name: /check & seal/i }).click();
  await expect(dialog.getByRole("alert")).toHaveText(/Claude rejected that key/);
  expect(seen.some((r) => r.path === "/grade")).toBe(false);
});

test("validation errors from the marker are shown on the page", async ({ page }) => {
  await mockBackend(page, { keyActive: true, grade: (r) => json(r, 422, { code: "answer_too_short", message: "x" }) });
  await page.goto("/english");
  await fillAnswer(page);
  await page.getByRole("button", { name: /submit for marking/i }).click();
  await expect(page.locator("p[role=alert]")).toHaveText(/too short to mark/);
});

test("a job that fails shows Claude's reason", async ({ page }) => {
  await mockBackend(page, { keyActive: true, gradeJobError: "refusal" });
  await page.goto("/english");
  await fillAnswer(page);
  await page.getByRole("button", { name: /submit for marking/i }).click();
  await expect(page.getByRole("button", { name: /marking…/i })).toBeVisible();
  await expect(page.locator("p[role=alert]")).toHaveText(/declined to mark/, { timeout: 15_000 });
});

test("an expired key reopens the key dialog with an explanation", async ({ page }) => {
  await mockBackend(page, { keyActive: true, grade: (r) => json(r, 401, { code: "key_expired", message: "x" }) });
  await page.goto("/english");
  await expect(page.getByText(/Key active/)).toBeVisible();
  await fillAnswer(page);
  await page.getByRole("button", { name: /submit for marking/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText(/forgotten for safety/)).toBeAttached();
});

test("forget my key clears it", async ({ page }) => {
  const seen = await mockBackend(page, { keyActive: true });
  await page.goto("/english");
  await page.getByRole("button", { name: /forget my key now/i }).click();
  await expect(page.getByText("No key added")).toBeVisible();
  expect(seen.some((r) => r.method === "DELETE" && r.path === "/session/key")).toBe(true);
});

test("backend down shows a friendly network error", async ({ page }) => {
  await mockBackend(page, { down: true });
  await page.goto("/english");
  await page.getByRole("button", { name: "Add key" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Paste your key").fill("sk-ant-test");
  await dialog.getByRole("button", { name: /check & seal/i }).click();
  await expect(dialog.getByRole("alert")).toHaveText(/Could not reach the marking service/);
});

test("stopwatch runs and resets", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/english");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("img", { name: /Stopwatch: 00:0[2-9]/ })).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Reset timer" }).click();
  await expect(page.getByRole("img", { name: "Stopwatch: 00:00 elapsed" })).toBeVisible();
});

test("print buttons open the print dialog and the print layout hides the site chrome", async ({ page }) => {
  await mockBackend(page, { keyActive: true });
  await page.goto("/english");
  await page.evaluate(() => { (window as unknown as { printed: number }).printed = 0; window.print = () => { (window as unknown as { printed: number }).printed++; }; });
  await fillAnswer(page);

  await page.getByRole("button", { name: "Print to edit" }).click();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-draft")).toBeVisible();
  await expect(page.locator(".print-draft h1")).toHaveText(QUESTION);
  await expect(page.locator("header.header")).toBeHidden();
  await expect(page.getByRole("button", { name: /submit for marking/i })).toBeHidden();
  await page.emulateMedia({ media: "screen" });

  await page.getByRole("button", { name: /submit for marking/i }).click();
  await page.getByRole("button", { name: "Print marked essay" }).click();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByText("Content & Structure: 9 / 16 · Level 4")).toBeVisible();
  await expect(page.getByRole("button", { name: /show full-marks version/i })).toBeHidden();
  await page.emulateMedia({ media: "screen" });

  await page.getByRole("button", { name: /show full-marks version/i }).click();
  await page.getByRole("button", { name: "Print", exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(3);
});
