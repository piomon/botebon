import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PORTAL_URL = "https://projektebon.pl";
const NABOR_NAME = 'NABÓR 9 „Nabór z Bilansem Kompetencji i doradztwem zawodowym"';

function findChromiumPath(): string {
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) {
    console.log(`[automation] Using CHROMIUM_PATH: ${process.env.CHROMIUM_PATH}`);
    return process.env.CHROMIUM_PATH;
  }

  const candidates = [
    "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
  ];

  for (const p of candidates) {
    if (existsSync(p)) {
      console.log(`[automation] Found browser at: ${p}`);
      return p;
    }
  }

  throw new Error("Nie znaleziono Chromium/Chrome. Ustaw zmienna CHROMIUM_PATH lub zainstaluj chromium.");
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

async function waitForNav(page: Page, action: () => Promise<void>, timeout = 60000) {
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout }).catch(() => {}),
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
      headless: "shell",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-translate",
        "--disable-domain-reliability",
        "--disable-renderer-backgrounding",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-ipc-flooding-protection",
        "--metrics-recording-only",
        "--mute-audio",
        "--no-first-run",
        "--js-flags=--max-old-space-size=128",
        "--window-size=1280,900",
        "--disable-features=site-per-process",
        "--disable-component-update",
      ],
      protocolTimeout: 120000,
      timeout: 60000,
    };
    launchOptions.executablePath = chromiumPath;
    console.log(`[automation] Launching browser: ${chromiumPath}`);
    browser = await puppeteer.launch(launchOptions);
    console.log(`[automation] Browser launched successfully, PID: ${browser.process()?.pid}`);

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    addStep(log("init", "ok", "Uruchomiono przegladarke"));

    let screenshot = "";
    let loginPageLoaded = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto("https://aplikuj.projektebon.pl/login", { waitUntil: "domcontentloaded", timeout: 60000 });
        loginPageLoaded = true;
        break;
      } catch (navErr: any) {
        console.log(`[automation] Login page attempt ${attempt}/3 failed: ${navErr.message}`);
        if (attempt === 3) throw navErr;
        await delay(2000);
      }
    }
    addStep(log("otwarcie_portalu", "ok", "Otwarto strone logowania"));

    await delay(300);

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
            await delay(300);
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
    await page.type(loginField, participant.loginPortal, { delay: 5 });

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
      await page.type(passwordField, participant.haslo, { delay: 5 });
    }

    addStep(log("logowanie_wypelnienie", "ok", `Wypelniono login: ${participant.loginPortal}`));

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

    await delay(500);
    addStep(log("logowanie_submit", submitted ? "ok" : "error", submitted ? "Wyslano formularz logowania" : "Nie udalo sie wyslac formularza"));

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
      await page.goto(rekLink.href, { waitUntil: "domcontentloaded", timeout: 60000 });
      await delay(300);
      addStep(log("rekrutacja", "ok", `Przejscie do: ${rekLink.text} (${rekLink.href})`));
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
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
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

    await delay(1000);
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
      await delay(1000);
      addStep(log("nabor", "ok", `Znaleziono i kliknieto NABOR 9 ("${naborResult.text}"). Strona: ${page.url()}`));
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
        const applyKeywords = ["weź udział w naborze", "wez udzial w naborze", "weź udział", "wez udzial", "zloz wniosek", "złóż wniosek", "aplikuj", "wypelnij", "wypełnij", "formularz", "zloz", "złóż", "zapisz sie", "zapisz się", "zglos sie", "zgłoś się", "przystap", "przystąp"];
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
        await delay(1000);
        formOpened = true;
        addStep(log("formularz_otwarcie", "ok", `Kliknieto: "${applyResult.text}". Strona: ${page.url()}`));
      } else {
        screenshot = await takeScreenshot(page);
        addStep(log("formularz_otwarcie", "skip", `Nie znaleziono przycisku zlozenia wniosku na stronie naboru. Strona: ${page.url()}`, screenshot));
      }
    } else {
      addStep(log("formularz_otwarcie", "skip", "Pominieto — NABOR 9 nie jest jeszcze dostepny"));
    }

    // The EBON portal form has sections with "Edytuj" buttons:
    // 1. Dane kontaktowe -> Edytuj
    // 2. Adres zamieszkania -> Edytuj
    // 3. Wykształcenie i status na rynku pracy -> Edytuj
    // 4. Przynależność do grupy docelowej -> Edytuj
    // 5. Udział w Projekcie -> Edytuj
    // Then "Wyślij zgłoszenie" to submit

    const participantData = {
      imie: participant.imie,
      nazwisko: participant.nazwisko,
      pesel: participant.pesel,
      email: participant.email,
      telefon: participant.telefon,
      adres: participant.adres,
      kodPocztowy: participant.kodPocztowy,
      miasto: participant.miasto,
    };

    // First, try clicking "Wypełnij zgłoszenie" if visible
    const wypelnijResult = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a, button, [role='button']"));
      for (const el of links) {
        const text = (el.textContent || "").trim().toLowerCase();
        if (text.includes("wypełnij zgłoszenie") || text.includes("wypelnij zgloszenie")) {
          (el as HTMLElement).click();
          return { found: true, text: (el.textContent || "").trim().substring(0, 60) };
        }
      }
      return { found: false, text: "" };
    });
    if (wypelnijResult.found) {
      await delay(1500);
      addStep(log("wypelnij_zgloszenie", "ok", `Kliknieto: "${wypelnijResult.text}"`));
    }

    // Helper: click an "Edytuj" button near a section heading, fill fields, save
    const sectionNames = [
      "dane kontaktowe",
      "adres zamieszkania",
      "wykształcenie",
      "przynależność",
      "udział w projekcie",
    ];

    let totalFilled = 0;

    for (const sectionName of sectionNames) {
      // Find and click the "Edytuj" link/button in this section
      const editClicked = await page.evaluate((secName) => {
        // Strategy 1: find heading/text with section name, then find nearby "Edytuj"
        const allElements = Array.from(document.querySelectorAll("*"));
        for (const el of allElements) {
          const text = (el.textContent || "").trim().toLowerCase();
          if (text.includes(secName) && text.includes("edytuj")) {
            // This element contains both section name and "edytuj" - find the edytuj link inside
            const editLinks = el.querySelectorAll("a, button");
            for (const link of Array.from(editLinks)) {
              const linkText = (link.textContent || "").trim().toLowerCase();
              if (linkText.includes("edytuj")) {
                (link as HTMLElement).click();
                return { found: true, section: secName };
              }
            }
          }
        }

        // Strategy 2: find sections/cards and match by structure
        const cards = Array.from(document.querySelectorAll("[class*='card'], [class*='section'], [class*='panel'], div, td, tr"));
        for (const card of cards) {
          const directText = (card.textContent || "").toLowerCase();
          if (directText.includes(secName)) {
            const editBtns = card.querySelectorAll("a, button");
            for (const btn of Array.from(editBtns)) {
              const btnText = (btn.textContent || "").trim().toLowerCase();
              if (btnText === "edytuj" || btnText.includes("edytuj")) {
                (btn as HTMLElement).click();
                return { found: true, section: secName };
              }
            }
          }
        }
        return { found: false, section: secName };
      }, sectionName);

      if (!editClicked.found) {
        addStep(log(`sekcja_${sectionName.replace(/\s/g, '_')}`, "skip", `Nie znaleziono przycisku Edytuj dla: ${sectionName}`));
        continue;
      }

      await delay(2000);

      // Now fill any visible input fields on the page
      const filledInSection = await page.evaluate((p) => {
        const fieldMappings = [
          { labels: ["imię", "imie", "first_name", "firstname", "name"], value: p.imie },
          { labels: ["nazwisko", "last_name", "lastname", "surname"], value: p.nazwisko },
          { labels: ["pesel"], value: p.pesel },
          { labels: ["email", "e-mail", "adres email", "mail"], value: p.email },
          { labels: ["telefon", "phone", "numer telefonu", "tel", "komórkowy", "komorkowy"], value: p.telefon },
          { labels: ["ulica", "adres", "address", "street"], value: p.adres },
          { labels: ["kod pocztowy", "kod_pocztowy", "postal", "zip", "kod"], value: p.kodPocztowy },
          { labels: ["miasto", "city", "miejscowość", "miejscowosc", "town"], value: p.miasto },
        ];

        let count = 0;
        const inputs = Array.from(document.querySelectorAll("input:not([type='hidden']):not([type='submit']):not([type='checkbox']):not([type='radio']), textarea, select")) as HTMLInputElement[];

        for (const input of inputs) {
          if (!input.offsetParent) continue; // skip hidden
          const name = (input.name || "").toLowerCase();
          const id = (input.id || "").toLowerCase();
          const placeholder = (input.placeholder || "").toLowerCase();
          const ariaLabel = (input.getAttribute("aria-label") || "").toLowerCase();
          // Also check parent label text
          const parentLabel = input.closest("label")?.textContent?.toLowerCase() || "";
          const forLabel = input.id ? (document.querySelector(`label[for="${input.id}"]`)?.textContent?.toLowerCase() || "") : "";

          const allText = `${name} ${id} ${placeholder} ${ariaLabel} ${parentLabel} ${forLabel}`;

          for (const mapping of fieldMappings) {
            if (mapping.labels.some(label => allText.includes(label))) {
              if (input.value && input.value.trim().length > 0) {
                // Already has a value, skip
                count++;
                break;
              }
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
              if (nativeInputValueSetter) {
                nativeInputValueSetter.call(input, mapping.value);
              } else {
                input.value = mapping.value;
              }
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              input.dispatchEvent(new Event('blur', { bubbles: true }));
              count++;
              break;
            }
          }
        }
        return count;
      }, participantData);

      totalFilled += filledInSection;

      // Try to save/close the section - look for "Zapisz", "Zatwierdź", "OK" button
      const saveResult = await page.evaluate(() => {
        const saveKeywords = ["zapisz", "zatwierdź", "zatwierdz", "ok", "save", "dalej", "zamknij"];
        const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], a.btn"));
        for (const btn of buttons) {
          const text = (btn.textContent || "").trim().toLowerCase();
          if (saveKeywords.some(kw => text.includes(kw))) {
            (btn as HTMLElement).click();
            return { saved: true, text: (btn.textContent || "").trim().substring(0, 40) };
          }
        }
        return { saved: false, text: "" };
      });

      await delay(1500);
      addStep(log(
        `sekcja_${sectionName.replace(/\s/g, '_')}`,
        "ok",
        `Sekcja "${sectionName}": wypelniono ${filledInSection} pol${saveResult.saved ? `, zapisano ("${saveResult.text}")` : ""}`
      ));
    }

    screenshot = await takeScreenshot(page);
    addStep(
      log(
        "formularz_wypelnienie",
        totalFilled > 0 ? "ok" : "skip",
        `Wypelniono lacznie ${totalFilled} pol w ${sectionNames.length} sekcjach`,
        screenshot
      )
    );

    if (autoSubmit) {
      // Click "Wyślij zgłoszenie" button
      const submitResult = await page.evaluate(() => {
        const submitKeywords = ["wyślij zgłoszenie", "wyslij zgloszenie", "wyślij", "wyslij", "submit", "złóż wniosek", "zloz wniosek"];
        const buttons = Array.from(document.querySelectorAll("a, button, input[type='submit'], [role='button']"));
        for (const btn of buttons) {
          const text = (btn.textContent || "").trim().toLowerCase();
          if (submitKeywords.some(kw => text.includes(kw))) {
            (btn as HTMLElement).click();
            return { clicked: true, text: (btn.textContent || "").trim().substring(0, 60) };
          }
        }
        return { clicked: false, text: "" };
      });

      await delay(3000);

      if (submitResult.clicked) {
        // Check for confirmation dialog/popup and confirm if needed
        const confirmResult = await page.evaluate(() => {
          const confirmKeywords = ["tak", "potwierdz", "potwierdzam", "yes", "ok", "wyślij", "wyslij"];
          const buttons = Array.from(document.querySelectorAll("button, a, [role='button']"));
          for (const btn of buttons) {
            const text = (btn.textContent || "").trim().toLowerCase();
            if (confirmKeywords.some(kw => text === kw || text.includes(kw))) {
              (btn as HTMLElement).click();
              return { confirmed: true, text: (btn.textContent || "").trim().substring(0, 40) };
            }
          }
          return { confirmed: false, text: "" };
        });

        await delay(2000);
        screenshot = await takeScreenshot(page);
        addStep(
          log(
            "wyslanie_wniosku",
            "ok",
            `Kliknieto: "${submitResult.text}"${confirmResult.confirmed ? ` + potwierdzono: "${confirmResult.text}"` : ""}. Strona: ${page.url()}`,
            screenshot
          )
        );
        status = "completed";
      } else {
        screenshot = await takeScreenshot(page);
        addStep(
          log(
            "wyslanie_wniosku",
            "skip",
            `Nie znaleziono przycisku "Wyslij zgloszenie". Strona: ${page.url()}`,
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
  concurrency = 4
): Promise<AutomationResult[]> {
  const results: AutomationResult[] = new Array(participants.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < participants.length) {
      const idx = nextIndex++;
      const p = participants[idx];
      console.log(`[automation] Starting parallel worker for ${p.imie} ${p.nazwisko} (${idx + 1}/${participants.length})`);
      try {
        results[idx] = await runAutomationForParticipant(p, onProgress);
      } catch (err: any) {
        results[idx] = {
          participantId: p.id,
          imie: p.imie,
          nazwisko: p.nazwisko,
          loginPortal: p.loginPortal,
          status: "error",
          steps: [{ step: "blad_krytyczny", status: "error", message: `Blad: ${err.message}`, timestamp: new Date().toISOString() }],
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        };
      }
    }
  }

  const workerCount = Math.min(concurrency, participants.length);
  console.log(`[automation] Launching ${workerCount} parallel workers for ${participants.length} participants`);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  return results;
}
