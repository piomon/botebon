import puppeteer, { type Browser, type Page } from "puppeteer";

const PORTAL_URL = "https://projektebon.pl";
const NABOR_NAME = 'NABÓR 9 „Nabór z Bilansem Kompetencji i doradztwem zawodowym"';

interface ParticipantData {
  id: number;
  imie: string;
  nazwisko: string;
  pesel: string;
  email: string;
  telefon: string;
  adres: string;
  kodPocztowy: string;
  miasto: string;
  loginPortal: string;
  haslo: string;
  notatki?: string | null;
}

export interface StepLog {
  step: string;
  status: "ok" | "error" | "skip" | "stop";
  message: string;
  timestamp: string;
  screenshotBase64?: string;
}

export interface AutomationResult {
  participantId: number;
  imie: string;
  nazwisko: string;
  loginPortal: string;
  status: "completed" | "error" | "stopped";
  steps: StepLog[];
  startedAt: string;
  finishedAt: string;
}

type ProgressCallback = (participantId: number, step: StepLog) => void;

function log(step: string, status: StepLog["status"], message: string, screenshot?: string): StepLog {
  return {
    step,
    status,
    message,
    timestamp: new Date().toISOString(),
    screenshotBase64: screenshot,
  };
}

async function takeScreenshot(page: Page): Promise<string> {
  try {
    const buf = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 60 });
    return buf as string;
  } catch {
    return "";
  }
}

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitAndClick(page: Page, selector: string, timeout = 15000) {
  await page.waitForSelector(selector, { visible: true, timeout });
  await page.click(selector);
}

async function waitForNav(page: Page, action: () => Promise<void>, timeout = 30000) {
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout }).catch(() => {}),
    action(),
  ]);
}

export async function runAutomationForParticipant(
  participant: ParticipantData,
  onProgress?: ProgressCallback,
  stopBeforeSend = true
): Promise<AutomationResult> {
  const steps: StepLog[] = [];
  const startedAt = new Date().toISOString();
  let browser: Browser | null = null;
  let status: AutomationResult["status"] = "completed";

  const addStep = (s: StepLog) => {
    steps.push(s);
    onProgress?.(participant.id, s);
  };

  try {
    const chromiumPath = process.env.CHROMIUM_PATH || "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";
    browser = await puppeteer.launch({
      headless: true,
      executablePath: chromiumPath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
        "--no-zygote",
        "--window-size=1280,900",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    addStep(log("init", "ok", "Uruchomiono przegladarke"));

    await page.goto(PORTAL_URL, { waitUntil: "networkidle2", timeout: 30000 });
    let screenshot = await takeScreenshot(page);
    addStep(log("otwarcie_portalu", "ok", `Otwarto ${PORTAL_URL}`, screenshot));

    await delay(1000);

    // Accept cookies if present
    try {
      const cookieButtons = await page.$$("button, a");
      for (const btn of cookieButtons) {
        const text = await btn.evaluate((el) => el.textContent?.toLowerCase() || "");
        if (text.includes("akceptuj") || text.includes("accept") || text.includes("zgadzam")) {
          await btn.click();
          await delay(500);
          addStep(log("cookies", "ok", "Zaakceptowano cookies"));
          break;
        }
      }
    } catch {}

    // Find and click "Aplikacja EBON" link to go to login page
    const appLink = await page.$$eval("a", (els) =>
      els.map((e) => ({ text: e.textContent?.trim() || "", href: e.href }))
    );
    const ebonAppLink = appLink.find(
      (l) =>
        l.text.toLowerCase().includes("aplikacja ebon") ||
        l.text.toLowerCase().includes("aplikacja") ||
        l.href.includes("aplikuj") ||
        l.text.toLowerCase().includes("zaloguj")
    );

    if (ebonAppLink) {
      await page.goto(ebonAppLink.href, { waitUntil: "networkidle2", timeout: 30000 });
      await delay(1000);
      screenshot = await takeScreenshot(page);
      addStep(log("przejscie_do_aplikacji", "ok", `Kliknieto: ${ebonAppLink.text} -> ${ebonAppLink.href}`, screenshot));
    }

    // Now find login form - could be on current page or need to navigate
    const loginSelectors = [
      'input[name="email"]',
      'input[name="username"]',
      'input[name="login"]',
      'input[type="email"]',
      'input[name="Email"]',
      '#email',
      '#login',
      '#username',
    ];

    let loginField: string | null = null;
    for (const sel of loginSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          loginField = sel;
          break;
        }
      } catch {}
    }

    // Check if we need to click a "Zaloguj" tab/link on the login page
    if (!loginField) {
      try {
        const loginTabs = await page.$$("a, button, div[role='tab']");
        for (const tab of loginTabs) {
          const text = await tab.evaluate((el) => el.textContent?.trim().toLowerCase() || "");
          if (text.includes("zaloguj") || text.includes("logowanie") || text === "login") {
            await tab.click();
            await delay(1000);
            break;
          }
        }
        for (const sel of loginSelectors) {
          try {
            const el = await page.$(sel);
            if (el) { loginField = sel; break; }
          } catch {}
        }
      } catch {}
    }

    if (!loginField) {
      const allInputs = await page.$$("input");
      for (const input of allInputs) {
        const type = await input.evaluate((el) => el.type);
        if (type === "text" || type === "email") {
          loginField = `input[type="${type}"]`;
          break;
        }
      }
    }

    if (!loginField) {
      screenshot = await takeScreenshot(page);
      addStep(log("logowanie", "error", "Nie znaleziono pola logowania na stronie", screenshot));
      status = "error";
      return { participantId: participant.id, imie: participant.imie, nazwisko: participant.nazwisko, loginPortal: participant.loginPortal, status, steps, startedAt, finishedAt: new Date().toISOString() };
    }

    await page.click(loginField);
    await page.type(loginField, participant.loginPortal, { delay: 30 });

    const passwordSelectors = ['input[type="password"]', 'input[name="password"]', 'input[name="haslo"]', '#password'];
    let passwordField: string | null = null;
    for (const sel of passwordSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          passwordField = sel;
          break;
        }
      } catch {}
    }

    if (passwordField) {
      await page.click(passwordField);
      await page.type(passwordField, participant.haslo, { delay: 30 });
    }

    screenshot = await takeScreenshot(page);
    addStep(log("logowanie_wypelnienie", "ok", `Wypelniono login: ${participant.loginPortal}`, screenshot));

    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      "button.login-btn",
      "button.btn-primary",
    ];
    let submitted = false;
    for (const sel of submitSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          await waitForNav(page, async () => {
            await btn.click();
          });
          submitted = true;
          break;
        }
      } catch {}
    }

    if (!submitted) {
      // Try clicking any button with "Zaloguj" or "Login" text
      try {
        const buttons = await page.$$("button");
        for (const btn of buttons) {
          const text = await btn.evaluate((el) => el.textContent?.toLowerCase() || "");
          if (text.includes("zaloguj") || text.includes("login") || text.includes("wyslij")) {
            await waitForNav(page, async () => { await btn.click(); });
            submitted = true;
            break;
          }
        }
      } catch {}
    }

    if (!submitted) {
      try {
        await waitForNav(page, async () => {
          await page.keyboard.press("Enter");
        });
        submitted = true;
      } catch {}
    }

    await delay(2000);
    screenshot = await takeScreenshot(page);
    addStep(log("logowanie_submit", submitted ? "ok" : "error", submitted ? "Wyslano formularz logowania" : "Nie udalo sie wyslac formularza", screenshot));

    if (!submitted) {
      status = "error";
      return { participantId: participant.id, imie: participant.imie, nazwisko: participant.nazwisko, loginPortal: participant.loginPortal, status, steps, startedAt, finishedAt: new Date().toISOString() };
    }

    const currentUrl = page.url();
    screenshot = await takeScreenshot(page);
    addStep(log("po_logowaniu", "ok", `Strona po logowaniu: ${currentUrl}`, screenshot));

    // Check if we hit verify-email page
    if (currentUrl.includes("verify-email")) {
      addStep(log("weryfikacja_email", "skip", "Portal wymaga weryfikacji adresu email. Konto musi byc potwierdzone przed zlozeniem wniosku.", screenshot));
    }

    // Try to navigate to recruitment/nabor section
    const allPageLinks = await page.$$eval("a", (els) =>
      els.map((e) => ({ text: e.textContent?.trim() || "", href: e.href }))
    );

    // Look for Rekrutacja / Nabory link
    const rekLink = allPageLinks.find(
      (l) =>
        l.text.toLowerCase().includes("rekrutacja") ||
        l.text.toLowerCase().includes("nabory") ||
        l.text.toLowerCase().includes("nabor") ||
        l.href.includes("rekrutacja") ||
        l.href.includes("recruitment") ||
        l.href.includes("nabor")
    );

    if (rekLink) {
      await page.goto(rekLink.href, { waitUntil: "networkidle2", timeout: 30000 });
      await delay(1000);
      screenshot = await takeScreenshot(page);
      addStep(log("rekrutacja", "ok", `Przejscie do: ${rekLink.text} (${rekLink.href})`, screenshot));
    } else {
      // Try direct URL patterns for the portal
      const directUrls = [
        "https://aplikuj.projektebon.pl/rekrutacja",
        "https://aplikuj.projektebon.pl/nabory",
        "https://aplikuj.projektebon.pl/dashboard",
      ];
      let found = false;
      for (const url of directUrls) {
        try {
          await page.goto(url, { waitUntil: "networkidle2", timeout: 15000 });
          const statusCode = await page.evaluate(() => document.title ? 200 : 404);
          if (statusCode === 200) {
            screenshot = await takeScreenshot(page);
            addStep(log("rekrutacja", "ok", `Przejscie do: ${url}`, screenshot));
            found = true;
            break;
          }
        } catch {}
      }
      if (!found) {
        screenshot = await takeScreenshot(page);
        addStep(log("rekrutacja", "skip", "Nie znaleziono sekcji rekrutacji", screenshot));
      }
    }

    const naborKeywords = ["nabor 9", "nabór 9", "bilans kompetencji", "doradztwo zawodowe", "nabor_9"];
    const allLinks = await page.$$eval("a", (els) =>
      els.map((e) => ({ text: e.textContent?.trim().toLowerCase() || "", href: e.href }))
    );
    let naborLink = allLinks.find((l) =>
      naborKeywords.some((kw) => l.text.includes(kw) || l.href.toLowerCase().includes(kw.replace(/\s/g, "")))
    );

    if (!naborLink) {
      naborLink = allLinks.find((l) => l.text.includes("nabór") || l.text.includes("nabor"));
    }

    if (naborLink) {
      await page.goto(naborLink.href, { waitUntil: "networkidle2", timeout: 30000 });
      await delay(1000);
      screenshot = await takeScreenshot(page);
      addStep(log("nabor", "ok", `Przejscie do naboru: ${naborLink.href}`, screenshot));
    } else {
      screenshot = await takeScreenshot(page);
      addStep(log("nabor", "skip", "Nie znaleziono linku do Naboru 9 — kontynuacja na biezacej stronie", screenshot));
    }

    const applyLinks = await page.$$eval("a, button", (els) =>
      els.map((e) => ({
        text: e.textContent?.trim().toLowerCase() || "",
        tag: e.tagName,
        href: (e as HTMLAnchorElement).href || "",
      }))
    );
    const applyLink = applyLinks.find(
      (l) =>
        l.text.includes("zloz wniosek") ||
        l.text.includes("złóż wniosek") ||
        l.text.includes("aplikuj") ||
        l.text.includes("wypelnij") ||
        l.text.includes("wypełnij") ||
        l.text.includes("formularz")
    );

    if (applyLink && applyLink.href) {
      await page.goto(applyLink.href, { waitUntil: "networkidle2", timeout: 30000 });
      await delay(1000);
      screenshot = await takeScreenshot(page);
      addStep(log("formularz_otwarcie", "ok", `Otwarto formularz: ${applyLink.href}`, screenshot));
    } else {
      screenshot = await takeScreenshot(page);
      addStep(log("formularz_otwarcie", "skip", "Nie znaleziono przycisku zlozenia wniosku", screenshot));
    }

    const fieldMappings: Array<{ labels: string[]; value: string; fieldName: string }> = [
      { labels: ["imię", "imie", "first_name", "firstname"], value: participant.imie, fieldName: "Imie" },
      { labels: ["nazwisko", "last_name", "lastname", "surname"], value: participant.nazwisko, fieldName: "Nazwisko" },
      { labels: ["pesel"], value: participant.pesel, fieldName: "PESEL" },
      { labels: ["email", "e-mail", "adres email"], value: participant.email, fieldName: "Email" },
      { labels: ["telefon", "phone", "numer telefonu", "tel"], value: participant.telefon, fieldName: "Telefon" },
      { labels: ["ulica", "adres", "address", "street"], value: participant.adres, fieldName: "Adres" },
      { labels: ["kod pocztowy", "kod_pocztowy", "postal", "zip"], value: participant.kodPocztowy, fieldName: "Kod pocztowy" },
      { labels: ["miasto", "city", "miejscowość", "miejscowosc"], value: participant.miasto, fieldName: "Miasto" },
    ];

    let filledCount = 0;
    for (const mapping of fieldMappings) {
      try {
        let filled = false;
        for (const label of mapping.labels) {
          const inputs = await page.$$("input, textarea");
          for (const input of inputs) {
            const attrs = await input.evaluate((el) => ({
              name: (el as HTMLInputElement).name?.toLowerCase() || "",
              id: el.id?.toLowerCase() || "",
              placeholder: (el as HTMLInputElement).placeholder?.toLowerCase() || "",
              type: (el as HTMLInputElement).type || "",
              ariaLabel: el.getAttribute("aria-label")?.toLowerCase() || "",
            }));

            if (
              attrs.type !== "hidden" &&
              attrs.type !== "submit" &&
              (attrs.name.includes(label) ||
                attrs.id.includes(label) ||
                attrs.placeholder.includes(label) ||
                attrs.ariaLabel.includes(label))
            ) {
              await input.click({ clickCount: 3 });
              await input.type(mapping.value, { delay: 20 });
              filled = true;
              filledCount++;
              break;
            }
          }
          if (filled) break;

          const labelEls = await page.$$("label");
          for (const labelEl of labelEls) {
            const text = await labelEl.evaluate((el) => el.textContent?.toLowerCase() || "");
            if (text.includes(label)) {
              const forId = await labelEl.evaluate((el) => el.getAttribute("for"));
              if (forId) {
                const target = await page.$(`#${forId}`);
                if (target) {
                  await target.click({ clickCount: 3 });
                  await target.type(mapping.value, { delay: 20 });
                  filled = true;
                  filledCount++;
                  break;
                }
              }
            }
          }
          if (filled) break;
        }
      } catch {}
    }

    screenshot = await takeScreenshot(page);
    addStep(
      log(
        "formularz_wypelnienie",
        filledCount > 0 ? "ok" : "skip",
        `Wypelniono ${filledCount} z ${fieldMappings.length} pol formularza`,
        screenshot
      )
    );

    if (stopBeforeSend) {
      screenshot = await takeScreenshot(page);
      addStep(
        log(
          "stop_przed_wyslaniem",
          "stop",
          "STOP — Formularz wypelniony. Wymagane reczne potwierdzenie i wyslanie wniosku. Automatyczne wyslanie jest zablokowane.",
          screenshot
        )
      );
      status = "stopped";
    }
  } catch (err: any) {
    steps.push(log("blad_krytyczny", "error", `Blad: ${err.message}`));
    status = "error";
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }

  return {
    participantId: participant.id,
    imie: participant.imie,
    nazwisko: participant.nazwisko,
    loginPortal: participant.loginPortal,
    status,
    steps,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

export async function runAutomationForAll(
  participants: ParticipantData[],
  onProgress?: ProgressCallback,
  spacingSec = 2
): Promise<AutomationResult[]> {
  const results: AutomationResult[] = [];

  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    const result = await runAutomationForParticipant(p, onProgress, true);
    results.push(result);

    if (i < participants.length - 1) {
      await delay(spacingSec * 1000);
    }
  }

  return results;
}
