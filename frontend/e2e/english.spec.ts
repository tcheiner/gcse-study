import { expect, test } from "@playwright/test";
import { ANSWER, fillAnswer, json, mockBackend, QUESTION } from "./fixtures";

const PAPER = "/english/cambridge-0990/paper-2/section-b";

test("happy path: add key, get marked, see full-marks version", async ({ page }) => {
  const seen = await mockBackend(page);
  await page.goto("/");
  await page.getByRole("link", { name: /start practising/i }).click();
  await expect(page).toHaveURL(/\/english\/cambridge-0990\/paper-2\/section-b$/);
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

  // Genre, both grids, the level drop and the two steps (on screen, not the hidden print sheet).
  const shown = page.locator("main > .screen-only");
  await expect(shown.getByText("Descriptive", { exact: true })).toBeVisible();
  await expect(shown.getByText("Content & Structure: 9 / 16 · Level 4")).toBeVisible();
  await expect(shown.getByText("Style & Accuracy: 13 / 24 · Level 4")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Level drop: a critical error" })).toBeVisible();
  await expect(shown.getByText("Use a semicolon to balance past and present.")).toBeVisible();

  // Margin annotations highlight the student's own words.
  await expect(shown.locator(".hl-strength", { hasText: "folded like a sleeper's" })).toBeVisible();
  await expect(shown.locator(".hl-improve", { hasText: "grandad winding it" })).toBeVisible();
  await expect(shown.getByText("This drifts into narrative: keep describing.")).toBeVisible();

  // Each grid has its own level track: select another level to read it.
  await page.getByRole("group", { name: "Style & Accuracy levels" }).getByRole("button", { name: "Level 6 · 21–24 marks" }).click();
  await expect(shown.getByText("Precise words, almost always accurate.")).toBeVisible();

  await page.getByRole("button", { name: /show full-marks version/i }).click();
  await expect(page.locator(".hl-change", { hasText: "the pendulum hangs mid-swing" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("radio", { name: "Side by side" }).click();
  await expect(page.locator("main > .screen-only").getByText("Your original · 22 / 40")).toBeVisible();

  await page.getByRole("button", { name: /back to my feedback/i }).click();
  await page.getByRole("button", { name: /back to my answer/i }).click();
  await expect(page.getByRole("textbox", { name: "Your answer", exact: true })).toHaveValue(/folded like a sleeper's/);
});

test("a rejected key shows the reason and nothing is marked", async ({ page }) => {
  const seen = await mockBackend(page, {
    addKey: (r) => json(r, 401, { code: "invalid_api_key", message: "nope" }),
  });
  await page.goto(PAPER);
  await page.getByRole("button", { name: "Add key" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Paste your key").fill("sk-ant-wrong");
  await dialog.getByRole("button", { name: /check & seal/i }).click();
  await expect(dialog.getByRole("alert")).toHaveText(/Claude rejected that key/);
  expect(seen.some((r) => r.path === "/grade")).toBe(false);
});

test("validation errors from the marker are shown on the page", async ({ page }) => {
  await mockBackend(page, { keyActive: true, grade: (r) => json(r, 422, { code: "answer_too_short", message: "x" }) });
  await page.goto(PAPER);
  await fillAnswer(page);
  await page.getByRole("button", { name: /submit for marking/i }).click();
  await expect(page.locator("p[role=alert]")).toHaveText(/too short to mark/);
});

test("a job that fails shows Claude's reason", async ({ page }) => {
  await mockBackend(page, { keyActive: true, gradeJobError: "refusal" });
  await page.goto(PAPER);
  await fillAnswer(page);
  await page.getByRole("button", { name: /submit for marking/i }).click();
  await expect(page.getByRole("button", { name: /marking…/i })).toBeVisible();
  await expect(page.locator("p[role=alert]")).toHaveText(/declined to mark/, { timeout: 15_000 });
});

test("an expired key reopens the key dialog with an explanation", async ({ page }) => {
  await mockBackend(page, { keyActive: true, grade: (r) => json(r, 401, { code: "key_expired", message: "x" }) });
  await page.goto(PAPER);
  await expect(page.getByText(/Key active/)).toBeVisible();
  await fillAnswer(page);
  await page.getByRole("button", { name: /submit for marking/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText(/forgotten for safety/)).toBeAttached();
});

test("forget my key clears it", async ({ page }) => {
  const seen = await mockBackend(page, { keyActive: true });
  await page.goto(PAPER);
  await page.getByRole("button", { name: /forget my key now/i }).click();
  await expect(page.getByText("No key added")).toBeVisible();
  expect(seen.some((r) => r.method === "DELETE" && r.path === "/session/key")).toBe(true);
});

test("? button pops up how to get a Claude key, then closes", async ({ page }) => {
  await mockBackend(page);
  await page.goto(PAPER);
  await page.getByRole("button", { name: "Add key" }).click();
  const dialog = page.getByRole("dialog", { name: "Your Claude API key" });
  const help = page.getByRole("dialog", { name: "Getting a Claude API key" });
  await expect(help).toBeHidden();

  await dialog.getByRole("button", { name: "How do I get a key?" }).click();
  await expect(help).toBeVisible();
  await expect(help.getByRole("listitem")).toHaveCount(6);
  await expect(help.getByText(/18 or over/)).toBeVisible();
  await expect(help.getByRole("link", { name: "API keys" })).toHaveAttribute("href", "https://platform.claude.com/settings/keys");

  await help.getByRole("button", { name: "Got it" }).click();
  await expect(help).toBeHidden();
  await expect(dialog).toBeVisible(); // the key dialog stays open underneath

  await dialog.getByRole("button", { name: "How do I get a key?" }).click();
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await expect(dialog.getByLabel("Paste your key")).toBeVisible();
});

test("backend down shows a friendly network error", async ({ page }) => {
  await mockBackend(page, { down: true });
  await page.goto(PAPER);
  await page.getByRole("button", { name: "Add key" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Paste your key").fill("sk-ant-test");
  await dialog.getByRole("button", { name: /check & seal/i }).click();
  await expect(dialog.getByRole("alert")).toHaveText(/Could not reach the marking service/);
});

test("stopwatch runs and resets", async ({ page }) => {
  await mockBackend(page);
  await page.goto(PAPER);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("img", { name: /Stopwatch: 00:0[2-9]/ })).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Reset timer" }).click();
  await expect(page.getByRole("img", { name: "Stopwatch: 00:00 elapsed" })).toBeVisible();
});

test("print buttons open the print dialog and each page prints a one-page A4 sheet", async ({ page }) => {
  await mockBackend(page, { keyActive: true });
  await page.goto(PAPER);
  await page.evaluate(() => { (window as unknown as { printed: number }).printed = 0; window.print = () => { (window as unknown as { printed: number }).printed++; }; });
  await fillAnswer(page);

  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".ps-draft")).toBeVisible();
  await expect(page.locator(".ps-draft h1")).toHaveText(QUESTION);
  await expect(page.locator("header.header")).toBeHidden();
  await expect(page.locator("#answer")).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await expect(page.locator(".ps-draft")).toBeHidden();

  await page.getByRole("button", { name: /submit for marking/i }).click();
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.emulateMedia({ media: "print" });
  const sheet = page.locator(".ps-marked");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".ps-stamp-score")).toHaveText("22/40");
  await expect(sheet.locator(".ps-hl-strength", { hasText: "folded like a sleeper's" })).toBeVisible();
  await expect(sheet.getByText("This drifts into narrative: keep describing.")).toBeVisible();
  await expect(page.getByRole("button", { name: /show full-marks version/i })).toBeHidden();
  await page.emulateMedia({ media: "screen" });

  await page.getByRole("button", { name: /show full-marks version/i }).click();
  await page.getByRole("button", { name: "Print", exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(3);
});

test("a long essay is scaled to fit one printed page", async ({ page }) => {
  await mockBackend(page, { keyActive: true });
  await page.goto(PAPER);
  const long = Array.from({ length: 14 }, () => "The rain kept falling on the empty platform while the old clock refused to move. ".repeat(5)).join("\n\n");
  await page.getByRole("textbox", { name: "Your answer", exact: true }).fill(long);
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  const zoom = Number(await page.locator(".ps-draft").evaluate((el) => (el as HTMLElement).style.zoom));
  expect(zoom).toBeGreaterThanOrEqual(0.5);
  expect(zoom).toBeLessThan(1);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator(".ps-draft")).toHaveAttribute("style", /^$|^\s*$/);
});

test("copyright footer is on the page and on printed sheets", async ({ page }) => {
  await mockBackend(page);
  await page.goto(PAPER);
  await expect(page.getByRole("contentinfo")).toHaveText("© 2026 Giant Growth. All rights reserved.");
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("contentinfo")).toBeHidden();
  await expect(page.locator(".ps-draft .ps-foot")).toHaveText("© 2026 Giant Growth. All rights reserved.");
});

test("Print sits in the same place, with the same label, on every page", async ({ page }) => {
  await mockBackend(page, { keyActive: true });
  await page.goto(PAPER);
  const print = page.getByRole("button", { name: "Print", exact: true });
  const box = async () => { await page.evaluate(() => window.scrollTo(0, 0)); const b = (await print.boundingBox())!; return [Math.round(b.x), Math.round(b.y), Math.round(b.width)]; };
  const onWrite = await box();
  await fillAnswer(page);
  await page.getByRole("button", { name: /submit for marking/i }).click();
  await expect(page.getByRole("heading", { name: /22 \/ 40/ })).toBeVisible({ timeout: 15_000 });
  expect(await box()).toEqual(onWrite);
  await page.getByRole("button", { name: /show full-marks version/i }).click();
  await expect(page.locator(".hl-change").first()).toBeVisible({ timeout: 15_000 });
  expect(await box()).toEqual(onWrite);
});

test("old /english links redirect to the paper URL, and unknown papers are not found", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/english");
  await expect(page).toHaveURL(new RegExp(`${PAPER}$`));
  await expect(page.getByText("Composition · 40 marks")).toBeVisible();
  // Streamed (Partial Prefetching), so the status is 200, but the visitor sees the not-found page.
  await page.goto("/english/cambridge-0990/paper-9/section-z");
  await expect(page.getByText(/could not be found/i)).toBeVisible();
});

test("landing page finds the practice: subject, board, paper and section", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Find your paper");
  const english = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "English" }) });
  await expect(english.getByText("Cambridge IGCSE · First Language English (0990)")).toBeVisible();
  await expect(english.getByText("Paper 2 · Directed Writing and Composition")).toBeVisible();
  await expect(english.getByText("Section B · Composition")).toBeVisible();
  await expect(english.getByRole("link", { name: /start practising/i })).toHaveAttribute("href", PAPER);
  for (const subject of ["Maths", "Science", "History"]) {
    const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: subject }) });
    await expect(card.getByText("Coming soon")).toBeVisible();
    await expect(card.getByRole("link")).toHaveCount(0);
  }
  await expect(page.getByText("No key added")).toHaveCount(0); // no key control on the landing page
  await expect(page.getByRole("contentinfo")).toContainText("Giant Growth");
});
