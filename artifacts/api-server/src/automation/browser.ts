import puppeteer, { type Browser, type Page } from "puppeteer";
import { existsSync } from "fs";

const PORTAL_URL = "https://projektebon.pl";
const NABOR_NAME = 'NABÓR 9 „Nabór z Bilansem Kompetencji i doradztwem zawodowym"';

function findChromiumPath(): string | undefined {
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) {
    return process.env.CHROMIUM_PATH;
  }

  try {
    const defaultPath = puppeteer.executablePath();
    if (defaultPath && existsSync(defaultPath)) {
      console.log(`[automation] Found puppeteer Chrome at: ${defaultPath}`);
      return defaultPath;
    }
  } catch {}

  const candidates = [
    "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ];

  for (const p of candidates) {
    if (existsSync(p)) {
      console.log(`[automation] Found browser at: ${p}`);
      return p;
    }
  }

  console.log("[automation] No browser found, will use puppeteer default");
  return undefined;
}

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
  autoSubmit = true
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
    const chromiumPath = findChromiumPath();
    const launchOptions: any = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
        "--no-zygote",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-translate",
        "--metrics-recording-only",
        "--mute-audio",
        "--no-first-run",
        "--window-size=1280,900",
      ],
      protocolTimeout: 60000,
    };
    if (chromiumPath) {
      launchOptions.executablePath = chromiumPath;
    }
    console.log(`[automation] Launching browser: ${chromiumPath || 'puppeteer-default'}`);
    browser = await puppeteer.launch(launchOptions);

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

    // Wait for dynamic content to load on recruitment list page
    await delay(3000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await delay(500);

    // Use page.evaluate to find and click NABOR 9 — much faster than iterating elements from Node
    const naborResult = await page.evaluate(() => {
      const allEls = Array.from(document.querySelectorAll("a, div, li, tr, button, span"));
      const nabor9Keywords = ["nabór 9", "nabor 9", "nabór nr 9"];
      const availableNabory: string[] = [];

      for (const el of allEls) {
        const text = (el.textContent || "").trim().toLowerCase();
        if (text.includes("rekrutacja:") && text.length < 200) {
          availableNabory.push((el.textContent || "").trim().substring(0, 100));
        }
      }

      // Try to find and click NABOR 9
      for (const el of allEls) {
        const text = (el.textContent || "").trim().toLowerCase();
        if (nabor9Keywords.some(kw => text.includes(kw)) && text.length < 300) {
          // Try clicking a link inside it first
          const link = el.querySelector("a");
          const target = link || el;
          (target as HTMLElement).click();
          return { found: true, text: (el.textContent || "").trim().substring(0, 100), availableNabory: availableNabory.filter((v, i, a) => a.indexOf(v) === i).slice(0, 8) };
        }
      }

      return { found: false, text: "", availableNabory: availableNabory.filter((v, i, a) => a.indexOf(v) === i).slice(0, 8) };
    });

    let naborFound = naborResult.found;

    if (naborFound) {
      await delay(3000);
      screenshot = await takeScreenshot(page);
      addStep(log("nabor", "ok", `Znaleziono i kliknieto NABOR 9 ("${naborResult.text}"). Strona: ${page.url()}`, screenshot));
    } else {
      screenshot = await takeScreenshot(page);
      addStep(log(
        "nabor",
        "skip",
        `NABOR 9 nie jest jeszcze dostepny na portalu. Nabor pojawi sie po otwarciu (10.04.2026 godz. 16:00). Dostepne nabory: ${naborResult.availableNabory.join(" | ")}`,
        screenshot
      ));
    }

    await delay(1000);

    // Only proceed to form if we found nabor
    let formOpened = false;
    if (naborFound) {
      const applyResult = await page.evaluate(() => {
        const applyKeywords = ["zloz wniosek", "złóż wniosek", "aplikuj", "wypelnij", "wypełnij", "formularz", "zloz", "złóż", "zapisz sie", "zapisz się", "zglos sie", "zgłoś się", "przystap", "przystąp"];
        const buttons = Array.from(document.querySelectorAll("a, button, [role='button'], input[type='submit']"));
        for (const el of buttons) {
          const text = (el.textContent || "").trim().toLowerCase();
          if (applyKeywords.some(kw => text.includes(kw))) {
            (el as HTMLElement).click();
            return { found: true, text: (el.textContent || "").trim().substring(0, 80) };
          }
        }
        return { found: false, text: "" };
      });

      if (applyResult.found) {
        await delay(3000);
        formOpened = true;
        screenshot = await takeScreenshot(page);
        addStep(log("formularz_otwarcie", "ok", `Kliknieto: "${applyResult.text}". Strona: ${page.url()}`, screenshot));
      } else {
        screenshot = await takeScreenshot(page);
        addStep(log("formularz_otwarcie", "skip", `Nie znaleziono przycisku zlozenia wniosku na stronie naboru. Strona: ${page.url()}`, screenshot));
      }
    } else {
      addStep(log("formularz_otwarcie", "skip", "Pominieto — NABOR 9 nie jest jeszcze dostepny"));
    }

    // Fill form fields using page.evaluate for speed
    const filledCount = await page.evaluate((p) => {
      const fieldMappings = [
        { labels: ["imię", "imie", "first_name", "firstname"], value: p.imie },
        { labels: ["nazwisko", "last_name", "lastname", "surname"], value: p.nazwisko },
        { labels: ["pesel"], value: p.pesel },
        { labels: ["email", "e-mail", "adres email"], value: p.email },
        { labels: ["telefon", "phone", "numer telefonu", "tel"], value: p.telefon },
        { labels: ["ulica", "adres", "address", "street"], value: p.adres },
        { labels: ["kod pocztowy", "kod_pocztowy", "postal", "zip"], value: p.kodPocztowy },
        { labels: ["miasto", "city", "miejscowość", "miejscowosc"], value: p.miasto },
      ];

      let count = 0;
      const inputs = Array.from(document.querySelectorAll("input, textarea")) as HTMLInputElement[];

      for (const mapping of fieldMappings) {
        let filled = false;
        for (const label of mapping.labels) {
          for (const input of inputs) {
            if (input.type === "hidden" || input.type === "submit") continue;
            const name = (input.name || "").toLowerCase();
            const id = (input.id || "").toLowerCase();
            const placeholder = (input.placeholder || "").toLowerCase();
            const ariaLabel = (input.getAttribute("aria-label") || "").toLowerCase();

            if (name.includes(label) || id.includes(label) || placeholder.includes(label) || ariaLabel.includes(label)) {
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
              if (nativeInputValueSetter) {
                nativeInputValueSetter.call(input, mapping.value);
              } else {
                input.value = mapping.value;
              }
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              filled = true;
              count++;
              break;
            }
          }
          if (filled) break;

          // Try via labels
          if (!filled) {
            const labels = Array.from(document.querySelectorAll("label"));
            for (const lbl of labels) {
              if ((lbl.textContent || "").toLowerCase().includes(label)) {
                const forId = lbl.getAttribute("for");
                if (forId) {
                  const target = document.getElementById(forId) as HTMLInputElement;
                  if (target) {
                    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                    if (setter) setter.call(target, mapping.value);
                    else target.value = mapping.value;
                    target.dispatchEvent(new Event('input', { bubbles: true }));
                    target.dispatchEvent(new Event('change', { bubbles: true }));
                    filled = true;
                    count++;
                    break;
                  }
                }
              }
            }
          }
          if (filled) break;
        }
      }
      return count;
    }, {
      imie: participant.imie,
      nazwisko: participant.nazwisko,
      pesel: participant.pesel,
      email: participant.email,
      telefon: participant.telefon,
      adres: participant.adres,
      kodPocztowy: participant.kodPocztowy,
      miasto: participant.miasto,
    });

    await delay(500);
    screenshot = await takeScreenshot(page);
    addStep(
      log(
        "formularz_wypelnienie",
        filledCount > 0 ? "ok" : "skip",
        `Wypelniono ${filledCount} z 8 pol formularza`,
        screenshot
      )
    );

    if (autoSubmit) {
      // Use page.evaluate for faster submit button detection
      const submitResult = await page.evaluate(() => {
        const submitKeywords = ["wyslij", "wyślij", "zatwierdz", "zatwierdź", "zapisz", "submit", "zloz wniosek", "złóż wniosek", "aplikuj", "wyslij wniosek"];
        const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], a.btn, a.button"));
        for (const btn of buttons) {
          const text = (btn.textContent || "").trim().toLowerCase();
          const type = (btn as HTMLInputElement).type || "";
          const value = ((btn as HTMLInputElement).value || "").toLowerCase();
          if (submitKeywords.some(kw => text.includes(kw) || value.includes(kw)) || type === "submit") {
            (btn as HTMLElement).click();
            return { clicked: true, text: (btn.textContent || "").trim().substring(0, 60) };
          }
        }
        return { clicked: false, text: "" };
      });

      await delay(3000);
      screenshot = await takeScreenshot(page);

      if (submitResult.clicked) {
        addStep(
          log(
            "wyslanie_wniosku",
            "ok",
            `Kliknieto przycisk wyslania ("${submitResult.text}"). Strona po wyslaniu: ${page.url()}`,
            screenshot
          )
        );
        status = "completed";
      } else {
        addStep(
          log(
            "wyslanie_wniosku",
            "skip",
            `Nie znaleziono przycisku wyslania wniosku. Strona: ${page.url()}`,
            screenshot
          )
        );
        status = "stopped";
      }
    } else {
      screenshot = await takeScreenshot(page);
      addStep(
        log(
          "stop_przed_wyslaniem",
          "stop",
          "Formularz wypelniony. Automatyczne wyslanie jest wylaczone.",
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
    const result = await runAutomationForParticipant(p, onProgress);
    results.push(result);

    if (i < participants.length - 1) {
      await delay(spacingSec * 1000);
    }
  }

  return results;
}
