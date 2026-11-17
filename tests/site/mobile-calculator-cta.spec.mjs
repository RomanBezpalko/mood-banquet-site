import { test, expect } from "@playwright/test";

test.describe("mobile calculator CTA", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes("mobile"), "CTA is mobile-only.");
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts?.ready);
  });

  test("appears after hero, hides near footer, reappears when scrolling up, and opens calculator", async ({
    page,
  }) => {
    const cta = page.locator(".mobile-calculator-cta");
    const hero = page.locator("[data-mobile-cta-trigger]");
    const footer = page.locator("[data-mobile-cta-hide]");

    await expect(cta).toBeAttached();
    await expect(cta).toBeHidden();
    await expect(cta).toHaveAttribute("aria-hidden", "true");
    await expect(cta).toHaveAttribute("tabindex", "-1");

    await page.evaluate(() => {
      const section = document.querySelector("[data-mobile-cta-trigger]");
      window.scrollTo(0, section.getBoundingClientRect().height + 100);
    });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("aria-hidden", "false");
    await expect(cta).toHaveAttribute("tabindex", "0");

    await footer.scrollIntoViewIfNeeded();
    await expect(cta).toBeHidden();

    await hero.scrollIntoViewIfNeeded();
    await expect(cta).toBeHidden();

    await page.evaluate(() => {
      const section = document.querySelector("[data-mobile-cta-trigger]");
      window.scrollTo(0, section.getBoundingClientRect().height + 100);
    });
    await expect(cta).toBeVisible();

    await cta.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});
