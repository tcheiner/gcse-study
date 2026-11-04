import { expect, test } from "@playwright/test";
import { ANSWER, fillAnswer, json, mockBackend } from "./fixtures";

test("happy path: add key, get marked, see full-marks version", async ({ page }) => {
  const seen = await mockBackend(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/english$/);
  await expect(page.getByText("No key added")).toBeVisible();

  await fillAnswer(page);
  await expect(page.getByText(`${ANSWER.trim().split(/\s+/).length} words`)).toBeAttached();
  await page.getByRole("radio", { name: "9 marks" }).click();
  await page.getByRole("button", { name: /submit for marking/i }).click();

  // No key yet: the dialog opens, then marking continues automatically.
  const dialog = page.getByRole("dialog", { name: "Your Claude API key" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Paste your key").fill("sk-ant-test-key");
  await dialog.getByRole("button", { name: /check & seal/i }).click();

  await expect(page.getByRole("heading", { name: /8 \/ 12/ })).toBeVisible();
  await expect(page.getByText(/Key active · forgets in (19|20) min/)).toBeVisible();
  const grade = seen.find((r) => r.path === "/grade")!;
  expect(grade.body).toMatchObject({ board: "edexcel-igcse", marks: 9, question: "How does the writer create tension?" });

  // The key field is cleared, and the key never appears in any request except /session/key.
  await expect(dialog).toBeHidden();
  expect(seen.filter((r) => JSON.stringify(r.body).includes("sk-ant-test-key")).map((r) => r.path)).toEqual(["/session/key"]);

  // Margin annotations highlight the student's own words.
  await expect(page.locator(".hl-strength", { hasText: "a sea of grey faces" })).toBeVisible();
  await expect(page.locator(".hl-improve", { hasText: "man at the front" })).toBeVisible();
  await expect(page.getByText("This is a structural shift: say why.")).toBeVisible();

  // Level track: select another level to read it.
  await page.getByRole("button", { name: /IV/ }).click();
  await expect(page.getByText("Perceptive and critical throughout.")).toBeVisible();

  await page.getByRole("button", { name: /show full-marks version/i }).click();
  await expect(page.locator(".hl-change", { hasText: "Structurally, the focus narrows" })).toBeVisible();
  await page.getByRole("radio", { name: "Side by side" }).click();
  await expect(page.getByText("Your original · 8 / 12")).toBeVisible();

  await page.getByRole("button", { name: /back to my feedback/i }).click();
  await page.getByRole("button", { name: /back to my answer/i }).click();
  await expect(page.getByRole("textbox", { name: "Your answer", exact: true })).toHaveValue(/sea of grey faces/);
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
