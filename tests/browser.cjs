const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    headless: true,
    args: ["--no-sandbox"],
  });
  const errors = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
  const artifact = process.env.TEST_ARTIFACT_DIR || "/tmp/cotescope-browser";
  fs.mkdirSync(artifact, { recursive: true });
  try {
    // Deterministic configuration fixture; actual provider authentication is a separate explicit pilot.
    await page.route("**/api/pulsescore/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: false,
          lastPilot: null,
          automaticCollection: false,
        }),
      }),
    );
    // Production starts with the public real feed. A source error stays visible;
    // demo fixtures become available only after the user explicitly selects them.
    await page.route("**/api/cotescope", (route) =>
      route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error: "cotescope_source_unavailable",
          demo: false,
          opportunities: [],
        }),
      }),
    );
    await page.goto(base);
    await page
      .getByRole("alert")
      .filter({ hasText: "flux cotes-value" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "CoteScope", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(await page.locator(".opportunity-row").count(), 0);
    await page.getByRole("button", { name: "Démo", exact: true }).click();
    await page.locator(".opportunity-row").first().waitFor();
    assert.equal(await page.locator(".opportunity-row").count(), 7);
    await page.waitForFunction(() => {
      const cover = document.querySelector(".scanner-cover");
      const crest = document.querySelector(".event-crests img");
      return (
        cover &&
        cover.complete &&
        cover.naturalWidth > 0 &&
        crest &&
        crest.complete &&
        crest.naturalWidth > 0
      );
    });
    await page
      .getByRole("button", { name: "Afficher : Tennis", exact: true })
      .click();
    assert.equal(await page.locator(".opportunity-row").count(), 2);
    await page
      .getByRole("button", { name: "Afficher tous les sports", exact: true })
      .click();
    assert.equal(await page.locator(".opportunity-row").count(), 7);
    assert.equal(await page.locator(".sidebar nav button").count(), 5);
    assert.equal(
      await page.locator(".hero-panel").count(),
      0,
      "The radar introduction belongs to the separate summary tab",
    );
    await page.getByRole("tab", { name: "Opportunités", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page
        .getByRole("tab", { name: "Filtres", exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
    await page.getByLabel("Sport", { exact: true }).selectOption("Tennis");
    await page.getByRole("tab", { name: "Opportunités", exact: true }).click();
    assert.equal(await page.locator(".opportunity-row").count(), 2);
    await page.getByRole("button", { name: "Journal", exact: true }).click();
    await page.getByRole("button", { name: "Scanner", exact: true }).click();
    assert.equal(
      await page.locator(".opportunity-row").count(),
      2,
      "Scanner filters survive primary navigation",
    );
    await page
      .getByRole("button", { name: "Réinitialiser", exact: true })
      .click();
    await page.getByRole("tab", { name: "Synthèse", exact: true }).click();
    assert.equal(await page.locator(".hero-panel").count(), 1);
    assert.equal(await page.locator(".opportunity-row").count(), 0);
    await page.getByRole("tab", { name: "Opportunités", exact: true }).click();
    await page.screenshot({ path: artifact + "/desktop.png", fullPage: true });
    await page
      .getByRole("textbox", { name: "Rechercher un match" })
      .fill("Alcaraz");
    assert.equal(await page.locator(".opportunity-row").count(), 1);
    await page
      .getByRole("textbox", { name: "Rechercher un match" })
      .fill("introuvable");
    await page
      .getByRole("heading", { name: "Aucun signal dans cette sélection." })
      .waitFor();
    await page
      .getByRole("button", { name: "Réinitialiser", exact: true })
      .click();
    assert.equal(await page.locator(".opportunity-row").count(), 7);
    // Reading and filtering must never place or record a bet.
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("cotescope.bet-history.v1") || "[]")
            .length,
      ),
      0,
    );
    await page.locator(".opportunity-row").first().click();
    await page
      .getByRole("dialog")
      .filter({ has: page.getByText("ANALYSE DU PRIX", { exact: false }) })
      .waitFor();
    await page.screenshot({ path: artifact + "/analysis.png" });
    await page.getByRole("button", { name: "Ajouter au journal démo" }).click();
    await page
      .getByRole("button", { name: "Journal", exact: false })
      .first()
      .click();
    await page.locator(".bet-card").waitFor();
    assert.equal(await page.locator(".bet-card").count(), 1);
    await page.locator(".bet-card select").selectOption("loss");
    assert.ok((await page.locator(".bet-profit").innerText()).includes("-10"));
    await page
      .getByRole("button", { name: "Performance", exact: true })
      .click();
    assert.ok(
      (await page.locator(".stats-grid").innerText()).includes("-100,0"),
    );
    await page.getByRole("img", { name: /Profit cumulé/ }).waitFor();
    await page
      .getByRole("button", { name: /Journal/ })
      .first()
      .click();
    await page.locator(".bet-card select").selectOption("win");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exporter CSV" }).click();
    const download = await downloadPromise;
    await download.saveAs(artifact + "/journal.csv");
    assert.ok(
      fs.readFileSync(artifact + "/journal.csv", "utf8").includes("Sabalenka"),
    );
    await page.reload();
    assert.equal(
      await page
        .getByRole("button", { name: "CoteScope", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await page.getByRole("button", { name: "Journal", exact: true }).click();
    assert.equal(
      await page.locator(".bet-card").count(),
      0,
      "A demo entry cannot appear in the default personal journal",
    );
    await page.getByRole("button", { name: "Scanner", exact: true }).click();
    await page.getByRole("button", { name: "Démo", exact: true }).click();
    await page.locator(".opportunity-row").first().waitFor();
    await page
      .getByRole("button", { name: /Journal/ })
      .first()
      .click();
    assert.equal(await page.locator(".bet-card").count(), 1);
    await page.getByRole("button", { name: /^Supprimer/ }).click();
    assert.equal(await page.locator(".bet-card").count(), 0);
    await page.getByRole("button", { name: "Outils", exact: true }).click();
    await page.getByRole("tab", { name: "Arbitrages", exact: true }).click();
    assert.ok(
      (await page.locator(".calculator-result").innerText()).includes("+3"),
    );
    await page.getByRole("spinbutton", { name: "Cote issue 1" }).fill("1.9");
    await page.getByRole("spinbutton", { name: "Cote issue 2" }).fill("1.9");
    assert.ok(
      (await page.locator(".calculator-result").innerText()).includes(
        "Pas d’arbitrage",
      ),
    );
    await page.getByRole("tab", { name: "Méthode", exact: true }).click();
    assert.equal(await page.locator(".method-card").count(), 4);
    // Deterministic engine history: near-kickoff CLV, refund, partial loss and first-detection dedup.
    const { loadTS } = require("./load-ts.cjs");
    const { adaptEngineHistory } = loadTS("src/lib/engineHistory.ts");
    const stamp = (offset) => new Date(Date.now() + offset).toISOString();
    const engineRow = {
      id: "engine-1",
      match_id: "historical-m",
      bookmaker: "Winamax",
      sport: "football",
      ligue: "Ligue 1",
      domicile: "Paris",
      exterieur: "Lyon",
      marche: "RESULTAT_1N2",
      periode: "MATCH",
      ligne: null,
      issue: "DOM",
      pari: "Paris",
      reference: "Pinnacle",
      simulation: "A",
      detecte: stamp(-7200000),
      debut: stamp(-3600000),
      lu_reference: stamp(-7210000),
      cote: 2.2,
      mise: 10,
      ecart: 0.025,
      statut: "gagne",
      gain: 12,
      cote_juste_cloture: 2,
      clv: 0.1,
      cloture_lue: stamp(-4500000),
      preuve_prise: {
        version: "test",
        controle: { statut: "conforme", n: 100 },
      },
      preuve_reglement: null,
    };
    const history = adaptEngineHistory([
      engineRow,
      {
        ...engineRow,
        id: "duplicate-ref",
        reference: "Betfair",
        simulation: "E",
        detecte: stamp(-7100000),
      },
      {
        ...engineRow,
        id: "engine-2",
        match_id: "refund-m",
        domicile: "Nice",
        marche: "DRAW_NO_BET",
        statut: "rembourse",
        gain: 0,
        cloture_lue: stamp(-7200000),
      },
      {
        ...engineRow,
        id: "engine-3",
        match_id: "quarter-m",
        domicile: "Lille",
        marche: "HANDICAP",
        ligne: -0.25,
        statut: "demi_perdu",
        gain: -5,
        clv: null,
      },
    ]);
    await page.route("**/api/cotes-value/history", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...history,
          fetchedAt: stamp(0),
          demo: false,
          source: "cotes-value",
        }),
      }),
    );
    await page
      .getByRole("button", { name: "Performance", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Bilan cotes-value", exact: true })
      .click();
    await page.locator(".engine-bet").first().waitFor();
    assert.equal(await page.locator(".engine-bet").count(), 3);
    assert.ok(
      (
        await page.locator(".engine-performance .stats-grid").innerText()
      ).includes("1 / 3"),
    );
    assert.ok(
      (
        await page.locator(".engine-performance .stats-grid").innerText()
      ).includes("23,3"),
    );
    await page
      .getByRole("combobox", { name: "Tranche d’écart", exact: true })
      .selectOption("E");
    assert.equal(await page.locator(".engine-bet").count(), 0);
    await page
      .getByRole("combobox", { name: "Référence du bilan" })
      .selectOption("Betfair");
    assert.equal(await page.locator(".engine-bet").count(), 1);
    await page.getByRole("button", { name: "Réinitialiser le bilan" }).click();
    await page.locator(".engine-bet summary").first().click();
    assert.ok(
      (await page.locator(".engine-bet[open]").innerText()).includes(
        "Aucune preuve de score publiée",
      ),
    );
    await page.screenshot({
      path: artifact + "/engine-performance.png",
      fullPage: true,
    });
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.route("**/api/cotes-value/history", (route) =>
      route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: "engine_history_unavailable", bets: [] }),
      }),
    );
    await page.getByRole("button", { name: "Actualiser le bilan" }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Historique cotes-value indisponible" })
      .waitFor();
    assert.equal(await page.locator(".engine-bet").count(), 0);
    await page
      .getByRole("button", { name: "Mon journal", exact: true })
      .click();
    await page.getByRole("button", { name: "Paramètres", exact: true }).click();
    await page
      .getByRole("spinbutton", { name: "Bankroll de référence (€)" })
      .fill("2000");
    await page
      .getByRole("button", { name: "Enregistrer les paramètres" })
      .click();
    await page.getByRole("tab", { name: "PulseScore", exact: true }).click();
    await page
      .locator(".pulse-setup-status")
      .getByText(/Clé à renseigner/)
      .waitFor();
    assert.equal(
      await page.evaluate(() => localStorage.getItem("cotescope.bankroll")),
      "2000",
    );
    await page.getByRole("button", { name: /^Scanner/ }).click();
    await page.getByRole("button", { name: "Live", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Neon" }).waitFor();
    assert.equal(await page.locator(".opportunity-row").count(), 0);
    await page.getByRole("button", { name: "Démo", exact: true }).click();
    await page.locator(".opportunity-row").first().waitFor();
    const { adaptCotesValue } = loadTS("src/lib/cotesValue.ts");
    const broader = adaptCotesValue([
      {
        ...engineRow,
        id: "current-quarter",
        match_id: "current-m",
        debut: stamp(3600000),
        detecte: stamp(-30000),
        lu_reference: stamp(-40000),
        marche: "TOTAL",
        ligne: 2.25,
        issue: "PLUS",
        pari: "Plus de 2,25",
        proba_juste: 0.5,
        controle: { statut: "conforme", n: 500, mediane: 0.9 },
        match_id_reference: "reference-current",
        match_reference: "Paris — Lyon",
        reference_inversee: false,
      },
    ]);
    await page.route("**/api/cotes-value", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...broader,
          source: "cotes-value",
          demo: false,
          generatedAt: stamp(0),
        }),
      }),
    );
    await page
      .getByRole("button", { name: "Cotes-value", exact: true })
      .click();
    await page.locator(".opportunity-row").first().waitFor();
    await page.getByRole("tab", { name: "Filtres", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Marché", exact: true })
      .selectOption("TOTAL");
    await page.getByRole("tab", { name: "Opportunités", exact: true }).click();
    assert.equal(await page.locator(".opportunity-row").count(), 1);
    await page.locator(".opportunity-row").first().click();
    await page
      .getByRole("heading", { name: "Preuves de comparaison" })
      .waitFor();
    assert.ok(
      (await page.locator("dialog[open]").innerText()).includes(
        "Kelly binaire et l’espérance en euros sont désactivés",
      ),
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Enregistrer ma prise", exact: true })
        .isDisabled(),
      false,
    );
    await page.screenshot({ path: artifact + "/market-evidence.png" });
    await page
      .getByRole("button", { name: "Enregistrer ma prise", exact: true })
      .click();
    await page
      .getByRole("button", { name: /Journal/ })
      .first()
      .click();
    await page.locator(".bet-card").waitFor();
    await page.locator(".bet-card select").selectOption("half_loss");
    assert.ok((await page.locator(".bet-profit").innerText()).includes("-5"));
    await page.locator(".bet-card select").selectOption("half_win");
    assert.ok((await page.locator(".bet-profit").innerText()).includes("6,00"));
    await page.locator(".bet-capture summary").click();
    assert.ok(
      (await page.locator(".bet-capture").innerText()).includes(
        "reference-current",
      ),
    );
    const proofDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exporter les preuves" }).click();
    await (await proofDownload).saveAs(artifact + "/proofs.json");
    const exportedProofs = JSON.parse(
      fs.readFileSync(artifact + "/proofs.json", "utf8"),
    );
    assert.equal(exportedProofs.bets[0].capture.fairOdds, 2);
    assert.equal(exportedProofs.bets[0].status, "half_win");
    assert.equal(exportedProofs.demo, false);
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("cotescope.bet-history.v1"))[0]
            .capture.evidence.referenceId,
      ),
      "reference-current",
    );
    await page.screenshot({
      path: artifact + "/journal-proofs.png",
      fullPage: true,
    });
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        "journal overflow at " + width,
      );
    }
    await page.screenshot({
      path: artifact + "/journal-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1050 });
    // A server schema upgrade must leave the locally recorded capture intact.
    await page.route("**/api/tracker", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "tracker_schema_upgrade_required" }),
      }),
    );
    await page
      .getByRole("button", { name: "Synchroniser", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Le serveur doit être mis à jour" })
      .waitFor();
    assert.equal(await page.locator(".bet-card").count(), 1);
    await page.getByRole("button", { name: /^Supprimer/ }).click();
    await page.getByRole("button", { name: /^Scanner/ }).click();
    await page.getByRole("button", { name: "Démo", exact: true }).click();
    await page.getByRole("tab", { name: "Filtres", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Marché", exact: true })
      .selectOption("Tous");
    await page.getByRole("tab", { name: "Opportunités", exact: true }).click();
    await page.locator(".opportunity-row").first().waitFor();
    // Feed failure must remain an error, not silently become demo.
    await page.route("**/api/cotes-value", (route) =>
      route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error: "cotes_value_unavailable",
          demo: false,
          opportunities: [],
        }),
      }),
    );
    await page
      .getByRole("button", { name: "Cotes-value", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "flux cotes-value" })
      .waitFor();
    assert.equal(await page.locator(".opportunity-row").count(), 0);
    await page.getByRole("button", { name: "Démo", exact: true }).click();
    await page.locator(".opportunity-row").first().waitFor();
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollHeight > innerHeight + 1,
        ),
        false,
        "Only the active view scrolls, not the whole page",
      );
      await page.locator(".page-content").evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      for (const button of await page.locator(".sidebar nav button").all()) {
        const box = await button.boundingBox();
        assert.ok(
          box && box.y >= 0 && box.y + box.height <= 845,
          "Primary navigation stays in the viewport",
        );
      }
      await page
        .getByRole("button", { name: "Paramètres", exact: true })
        .click();
      await page.getByRole("tab", { name: "PulseScore", exact: true }).click();
      await page
        .locator(".pulse-setup-status")
        .getByText(/Clé à renseigner/)
        .waitFor();
      assert.equal(await page.locator(".opportunity-row").count(), 0);
      assert.equal(
        await page.locator("dialog[open]").count(),
        0,
        "Settings are a separate view",
      );
      await page.screenshot({
        path: artifact + "/settings-" + width + ".png",
        fullPage: true,
      });
      await page.getByRole("button", { name: "Scanner", exact: true }).click();
      await page.screenshot({
        path: artifact + "/screen-" + width + ".png",
        fullPage: true,
      });
    }
    await page.locator(".opportunity-row").first().click();
    await page.getByRole("button", { name: "Fermer l’analyse" }).waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("dialog[open]").count(), 0);
    const { decideCoteScope } = loadTS("src/lib/decisionEngine.ts");
    const own = decideCoteScope([
      {
        ...engineRow,
        match_id: "own-event",
        debut: stamp(3600000),
        detecte: stamp(-30000),
        lu_reference: stamp(-30000),
        marche: "RESULTAT_1N2",
        periode: "MATCH",
        ligne: null,
        issue: "DOM",
        pari: "Paris",
        cote: 2.3,
        proba_juste: 0.5,
        reference: "Pinnacle",
        controle: { statut: "conforme", n: 1000, mediane: 0.95 },
        score_association: 0.98,
        match_id_reference: "own-reference",
        match_reference: "Paris — Lyon",
        suspect: null,
      },
    ]);
    assert.equal(own.opportunities.length, 1);
    await page.route("**/api/cotescope", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...own,
          source: "cotescope",
          demo: false,
          generatedAt: stamp(0),
        }),
      }),
    );
    await page.getByRole("button", { name: "CoteScope", exact: true }).click();
    await page.locator(".opportunity-row").first().waitFor();
    assert.equal(await page.locator(".opportunity-row").count(), 1);
    await page.locator(".decision-diagnostics summary").click();
    await page.screenshot({
      path: artifact + "/method-mobile.png",
      fullPage: true,
    });
    await page.locator(".opportunity-row").first().click();
    await page.getByText("CoteScope · robust-v1", { exact: true }).waitFor();
    const stakeInput = page.getByRole("spinbutton", {
      name: "Mise à enregistrer (€)",
    });
    await stakeInput.fill("999");
    assert.equal(
      await page
        .getByRole("button", { name: "Enregistrer ma prise", exact: true })
        .isDisabled(),
      true,
    );
    await stakeInput.fill("1");
    await page
      .getByRole("button", { name: "Enregistrer ma prise", exact: true })
      .click();
    const proof = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("cotescope.bet-history.v1") || "[]").find(
        (b) => b.opportunityId.startsWith("cs-"),
      ),
    );
    assert.equal(proof.capture.method.version, "robust-v1");
    assert.ok(proof.capture.method.stakeFraction <= 0.01);
    await page.getByRole("button", { name: "Outils", exact: true }).click();
    await page.getByRole("tab", { name: "Comparaison", exact: true }).click();
    await page
      .getByRole("heading", { name: "Comparer avant de conclure." })
      .waitFor();
    await page
      .getByText(
        "Échantillon insuffisant pour démontrer un meilleur rendement.",
        { exact: true },
      )
      .waitFor();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: artifact + "/comparison-" + width + ".png",
        fullPage: true,
      });
    }
    assert.deepEqual(errors, []);
    console.log(
      "Browser checks passed: filters, explicit recording, settlement, ROI, persistence, CSV, arbitrage, settings, source errors, dialog keyboard access responsive layouts, published simulation filters, measured CLV, partial settlement arithmetic and market evidence.",
    );
    console.log("Artifacts: " + artifact);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
