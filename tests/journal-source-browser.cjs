const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    headless: true, args: ["--no-sandbox"],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const bet = {
      id: "legacy-1", opportunityId: "cv-first", createdAt: "2026-10-07T21:24:41Z",
      updatedAt: "2026-10-07T21:24:41Z", sport: "Football", competition: "League",
      event: "A — B", market: "Résultat", selection: "Nul", bookmaker: "Winamax",
      odds: 2.65, stake: 10, initialEvPct: 4.28, opportunityScore: 62, status: "open",
    };
    await context.addInitScript((bets) => {
      localStorage.setItem("cotescope.bet-history.v1", JSON.stringify(bets));
    }, [bet, { ...bet, id: "legacy-2", opportunityId: "cv-second", event: "C — D" },
      { ...bet, id: "demo-1", opportunityId: "demo-1", event: "Example" }]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => {
      const url = new URL(route.request().url());
      const unavailable = url.pathname.includes("tracker") || url.searchParams.get("mode") === "live";
      return route.fulfill({ status: unavailable ? 503 : 200, contentType: "application/json",
        body: JSON.stringify(unavailable ? { error: "database_not_configured" } : {
          opportunities: [], source: url.pathname.includes("cotes-value") ? "cotes-value" : "cotescope",
          demo: url.searchParams.get("mode") === "demo", generatedAt: new Date().toISOString(),
          diagnostics: { selected: 0, candidates: 266, invalidRows: 0, rejected: {} },
        }),
      });
    });
    await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:3000");
    await page.getByRole("button", { name: "Journal", exact: true }).click();
    await page.getByRole("heading", { name: "Votre journal · CoteScope", exact: true }).waitFor();
    await page.getByText("2 prise(s) conservée(s) dans les autres sources.", { exact: false }).waitFor();
    assert.equal(await page.locator(".bet-card").count(), 0);
    assert.equal(await page.locator(".decision-diagnostics").count(), 0);
    assert.ok((await page.locator(".stats-grid").innerText()).includes("0,00"));
    await page.getByRole("checkbox", { name: "Afficher toutes les sources" }).check();
    assert.equal(await page.locator(".bet-card").count(), 2);
    assert.ok((await page.locator(".topbar .mode-tag").textContent()).includes("Toutes les sources"));
    await page.getByRole("button", { name: "Cotes-value", exact: true }).click();
    await page.getByRole("heading", { name: "Votre journal · Cotes-value", exact: true }).waitFor();
    assert.equal(await page.getByRole("checkbox", { name: "Afficher toutes les sources" }).isChecked(), false);
    assert.equal(await page.locator(".bet-card").count(), 2);
    assert.equal(await page.getByText("Source : Cotes-value", { exact: true }).count(), 2);
    assert.ok((await page.locator(".stats-grid").innerText()).includes("20,00"));
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exporter les preuves" }).click();
    const download = await downloadPromise;
    const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
    assert.equal(exported.source, "cotes-value");
    assert.equal(exported.bets.length, 2);
    assert.ok(exported.bets.every((b) => b.opportunityId.startsWith("cv-")));
    await page.getByRole("button", { name: "Démo", exact: true }).click();
    await page.getByRole("heading", { name: "Journal de démonstration", exact: true }).waitFor();
    assert.equal(await page.locator(".bet-card").count(), 1);
    await page.getByRole("button", { name: "Live", exact: true }).click();
    await page.getByRole("heading", { name: "Votre journal · Live", exact: true }).waitFor();
    await page.getByRole("alert").filter({ hasText: "base Neon" }).waitFor();
    assert.equal(await page.locator(".bet-card").count(), 0);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("cotescope.bet-history.v1")).length), 3);
    assert.deepEqual(errors, []);
    console.log("Journal source browser regression passed");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
