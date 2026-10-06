import { expect, test } from "@playwright/test";

function solve(text: string): number {
  const m = text.match(/(\d+)\s*([+−×÷-])\s*(\d+)/);
  if (!m) throw new Error("cannot parse: " + text);
  const a = Number(m[1]), b = Number(m[3]);
  return { "+": a + b, "−": a - b, "-": a - b, "×": a * b, "÷": a / b }[m[2] as "+"];
}

test("guest completes a 60-question drill and sees summary", async ({ page }) => {
  await page.goto("/drill");
  await page.getByRole("button", { name: "Start" }).click();
  const input = page.getByTestId("answer");
  for (let i = 0; i < 60; i++) {
    const text = await page.getByTestId("question").innerText();
    await input.pressSequentially(String(solve(text)));
  }
  await expect(page.getByTestId("total-time")).toBeVisible();
  await expect(page.getByText(/sign up to save/i)).toBeVisible();
});

test("wrong answer of the right length keeps the same question", async ({ page }) => {
  await page.goto("/drill");
  await page.getByRole("button", { name: "Start" }).click();
  const before = await page.getByTestId("question").innerText();
  const right = solve(before);
  const wrong = right % 10 === 9 ? right - 1 : right + 1;
  await page.getByTestId("answer").pressSequentially(String(wrong));
  await expect(page.getByTestId("answer")).toHaveValue("");
  expect(await page.getByTestId("question").innerText()).toBe(before);
});

test("non-digit input is ignored", async ({ page }) => {
  await page.goto("/drill");
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByTestId("answer").pressSequentially("-e+");
  await expect(page.getByTestId("answer")).toHaveValue("");
});

test("signup page rejects short password", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Email").fill("x@example.com");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: /sign up/i }).click();
  await expect(page.getByText(/at least 8/i)).toBeVisible();
});
