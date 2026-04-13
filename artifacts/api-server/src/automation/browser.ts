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

    // EBON portal form: 5-page wizard at /efz/efz/formone/
    // Page 1: Dane osobowe (Imię, Nazwisko, PESEL, Obywatelstwo, Data urodzenia, Płeć)
    //         + Dane kontaktowe (E-mail, Numer telefonu)
    // Page 2: Adres zamieszkania
    // Page 3: Wykształcenie i status na rynku pracy
    // Page 4: Przynależność do grupy docelowej
    // Page 5: Udział w Projekcie
    // Then: Wyślij zgłoszenie

    // Extract birth date and sex from PESEL
    function parsePesel(pesel: string) {
      const y2 = parseInt(pesel.substring(0, 2), 10);
      let m = parseInt(pesel.substring(2, 4), 10);
      const d = parseInt(pesel.substring(4, 6), 10);
      let century = 1900;
      if (m > 80) { century = 1800; m -= 80; }
      else if (m > 60) { century = 2200; m -= 60; }
      else if (m > 40) { century = 2100; m -= 40; }
      else if (m > 20) { century = 2000; m -= 20; }
      const year = century + y2;
      const sexDigit = parseInt(pesel.charAt(9), 10);
      const sex = sexDigit % 2 === 0 ? "K" : "M";
      const mm = String(m).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      return { birthDate: `${mm}/${dd}/${year}`, year, month: m, day: d, sex };
    }

    const peselData = parsePesel(participant.pesel);

    // First, try clicking "Wypełnij zgłoszenie" if visible
    const wypelnijResult = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a, button, [role='button']"));
      for (const el of links) {
        const text = (el.textContent || "").trim().toLowerCase();
        if (text.includes("wypełnij zgłoszenie") || text.includes("wypelnij zgloszenie") || text.includes("wypełnij") || text.includes("wypelnij")) {
          (el as HTMLElement).click();
          return { found: true, text: (el.textContent || "").trim().substring(0, 60) };
        }
      }
      return { found: false, text: "" };
    });
    if (wypelnijResult.found) {
      await delay(2000);
      addStep(log("wypelnij_zgloszenie", "ok", `Kliknieto: "${wypelnijResult.text}"`));
    }

    // Helper function to fill all visible fields on the current page
    // Strategy: fill known fields with real data, fill ALL other required empty fields with defaults
    async function fillCurrentPageFields() {
      const result = await page.evaluate((p) => {
        function setVal(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
          if (input.tagName === 'SELECT') {
            const select = input as HTMLSelectElement;
            const options = Array.from(select.options).filter(o => o.value && o.value !== "" && !o.disabled);
            // Try to match by text
            const match = options.find(o =>
              o.text.toLowerCase().includes(value.toLowerCase()) ||
              o.value.toLowerCase().includes(value.toLowerCase())
            );
            if (match) {
              select.value = match.value;
            } else if (options.length > 0) {
              // Pick first non-empty option as default
              select.value = options[0].value;
            }
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (nativeSetter) nativeSetter.call(input, value);
          else input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('blur', { bubbles: true }));
          return true;
        }

        function getLabelText(input: HTMLElement): string {
          const id = input.id || input.getAttribute("name") || "";
          let labelText = "";
          if (id) {
            const lbl = document.querySelector(`label[for="${id}"]`);
            if (lbl) labelText += " " + (lbl.textContent || "").toLowerCase();
          }
          const parentLabel = input.closest("label");
          if (parentLabel) labelText += " " + (parentLabel.textContent || "").toLowerCase();
          const parent = input.parentElement;
          if (parent) {
            const prev = parent.previousElementSibling;
            if (prev) labelText += " " + (prev.textContent || "").toLowerCase();
            labelText += " " + (parent.textContent || "").toLowerCase().substring(0, 200);
          }
          labelText += " " + (input.getAttribute("name") || "").toLowerCase();
          labelText += " " + (input.getAttribute("id") || "").toLowerCase();
          labelText += " " + (input.getAttribute("placeholder") || "").toLowerCase();
          labelText += " " + (input.getAttribute("aria-label") || "").toLowerCase();
          return labelText;
        }

        // Known field mappings with real participant data
        const fieldMappings: { match: string[]; value: string }[] = [
          { match: ["imię", "imie", "first_name"], value: p.imie },
          { match: ["nazwisko", "last_name", "surname"], value: p.nazwisko },
          { match: ["pesel"], value: p.pesel },
          { match: ["e-mail", "email"], value: p.email },
          { match: ["numer telefonu", "telefon", "phone", "tel"], value: p.telefon },
          { match: ["ulica", "adres zamieszkania", "street"], value: p.adres },
          { match: ["kod pocztowy", "postal", "zip"], value: p.kodPocztowy },
          { match: ["miasto", "miejscowość", "miejscowosc", "city"], value: p.miasto },
          { match: ["obywatelstwo"], value: "polskie" },
          { match: ["płeć", "plec", "sex"], value: p.sex },
          { match: ["data urodzenia", "data_urodzenia", "birth"], value: p.birthDate },
          { match: ["województwo", "wojewodztwo"], value: "łódzkie" },
          { match: ["powiat"], value: "łódzki" },
          { match: ["gmina"], value: "Łódź" },
          { match: ["nr domu", "numer domu", "nr budynku"], value: "1" },
          { match: ["nr lokalu", "numer lokalu", "nr mieszkania"], value: "1" },
          { match: ["poczta"], value: p.miasto },
          { match: ["kraj"], value: "Polska" },
        ];

        let filled = 0;
        const filledFields: string[] = [];

        // Step 1: Fill known fields
        const allInputs = Array.from(document.querySelectorAll("input, textarea, select")) as (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)[];
        const handledInputs = new Set<HTMLElement>();

        for (const input of allInputs) {
          const inputEl = input as HTMLInputElement;
          if (inputEl.type === 'hidden' || inputEl.type === 'submit' || inputEl.type === 'button') continue;

          const labelText = getLabelText(input as HTMLElement);
          let matched = false;

          for (const mapping of fieldMappings) {
            if (mapping.match.some(m => labelText.includes(m))) {
              matched = true;
              handledInputs.add(input as HTMLElement);
              if (input.value && input.value.trim().length > 0 && input.tagName !== 'SELECT') {
                filled++;
                filledFields.push(`${mapping.match[0]}(ok)`);
              } else {
                setVal(input as HTMLInputElement, mapping.value);
                filled++;
                filledFields.push(mapping.match[0]);
              }
              break;
            }
          }
        }

        // Step 2: Check ALL remaining checkboxes - check them all
        const checkboxes = Array.from(document.querySelectorAll("input[type='checkbox']")) as HTMLInputElement[];
        for (const cb of checkboxes) {
          if (!cb.checked) {
            cb.click();
            filled++;
            const lbl = getLabelText(cb).trim().substring(0, 30);
            filledFields.push(`cb:${lbl || "unknown"}`);
          }
          handledInputs.add(cb);
        }

        // Step 3: For ALL remaining empty required fields — fill with defaults
        for (const input of allInputs) {
          if (handledInputs.has(input as HTMLElement)) continue;
          const inputEl = input as HTMLInputElement;
          if (inputEl.type === 'hidden' || inputEl.type === 'submit' || inputEl.type === 'button' || inputEl.type === 'checkbox' || inputEl.type === 'radio') continue;
          if (inputEl.readOnly || inputEl.disabled) continue;

          // Skip if already has value
          if (input.value && input.value.trim().length > 0 && input.tagName !== 'SELECT') continue;

          const labelText = getLabelText(input as HTMLElement);

          if (input.tagName === 'SELECT') {
            const select = input as HTMLSelectElement;
            if (select.value && select.value !== "") continue;
            const options = Array.from(select.options).filter(o => o.value && o.value !== "" && !o.disabled);
            if (options.length > 0) {
              select.value = options[0].value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              filled++;
              filledFields.push(`sel:${labelText.trim().substring(0, 20) || "unknown"}`);
            }
            continue;
          }

          if (inputEl.type === 'date') {
            setVal(inputEl, p.birthDate);
            filled++;
            filledFields.push(`date:${labelText.trim().substring(0, 20) || "unknown"}`);
            continue;
          }

          if (inputEl.type === 'number') {
            setVal(inputEl, "1");
            filled++;
            filledFields.push(`num:${labelText.trim().substring(0, 20) || "unknown"}`);
            continue;
          }

          // Default text: use "x" or "brak" for unknown text fields
          setVal(inputEl, "brak");
          filled++;
          filledFields.push(`txt:${labelText.trim().substring(0, 20) || "unknown"}`);
        }

        // Step 4: Handle radio buttons - select first option in each group
        const radioGroups = new Set<string>();
        const radios = Array.from(document.querySelectorAll("input[type='radio']")) as HTMLInputElement[];
        for (const radio of radios) {
          const name = radio.name;
          if (radioGroups.has(name)) continue;
          // Check if any in this group is already checked
          const group = Array.from(document.querySelectorAll(`input[type='radio'][name='${name}']`)) as HTMLInputElement[];
          const anyChecked = group.some(r => r.checked);
          if (!anyChecked && group.length > 0) {
            group[0].click();
            radioGroups.add(name);
            filled++;
            filledFields.push(`radio:${name}`);
          } else {
            radioGroups.add(name);
          }
        }

        return { filled, filledFields };
      }, {
        imie: participant.imie,
        nazwisko: participant.nazwisko,
        pesel: participant.pesel,
        email: participant.email,
        telefon: participant.telefon,
        adres: participant.adres,
        kodPocztowy: participant.kodPocztowy,
        miasto: participant.miasto,
        sex: peselData.sex === "K" ? "kobieta" : "mężczyzna",
        birthDate: peselData.birthDate,
      });
      return result;
    }

    // Helper to click "Dalej" / "Następny" / "Next" or save button
    async function clickNextOrSave(): Promise<{ clicked: boolean; text: string }> {
      const result = await page.evaluate(() => {
        const keywords = ["dalej", "następny", "nastepny", "next", "zapisz i przejdź", "zapisz i przejdz", "zapisz", "save", "kontynuuj"];
        const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], a.btn, a[class*='btn']"));
        for (const btn of buttons) {
          const text = (btn.textContent || "").trim().toLowerCase();
          if (keywords.some(kw => text.includes(kw))) {
            (btn as HTMLElement).click();
            return { clicked: true, text: (btn.textContent || "").trim().substring(0, 60) };
          }
        }
        // Try submit button as fallback
        const submitBtns = Array.from(document.querySelectorAll("button[type='submit'], input[type='submit']"));
        if (submitBtns.length > 0) {
          (submitBtns[0] as HTMLElement).click();
          return { clicked: true, text: (submitBtns[0].textContent || "submit").substring(0, 60) };
        }
        return { clicked: false, text: "" };
      });
      return result;
    }

    // Process up to 5 form pages
    let totalFilled = 0;
    let allFilledFields: string[] = [];

    for (let pageNum = 1; pageNum <= 5; pageNum++) {
      await delay(1500);

      // Check page title/heading
      const pageInfo = await page.evaluate(() => {
        const heading = document.querySelector("h1, h2, h3, [class*='title'], [class*='header']");
        const pageText = heading ? (heading.textContent || "").trim().substring(0, 120) : document.title;
        const inputCount = document.querySelectorAll("input:not([type='hidden']):not([type='submit']), textarea, select").length;
        return { pageText, inputCount, url: window.location.href };
      });

      addStep(log(`strona_${pageNum}`, "ok", `Strona ${pageNum}/5: "${pageInfo.pageText}" (${pageInfo.inputCount} pol)`));

      // Fill fields on this page
      const fillResult = await fillCurrentPageFields();
      totalFilled += fillResult.filled;
      allFilledFields = allFilledFields.concat(fillResult.filledFields);

      addStep(log(`wypelnienie_strona_${pageNum}`, fillResult.filled > 0 ? "ok" : "skip",
        `Strona ${pageNum}: wypelniono ${fillResult.filled} pol [${fillResult.filledFields.join(", ")}]`));

      // Check if this is the last page (page 5) - look for "Wyślij" instead of "Dalej"
      if (pageNum === 5) break;

      // Click next/save to go to next page
      const nextResult = await clickNextOrSave();
      if (nextResult.clicked) {
        await delay(2000);
        addStep(log(`nawigacja_strona_${pageNum}`, "ok", `Kliknieto: "${nextResult.text}"`));
      } else {
        addStep(log(`nawigacja_strona_${pageNum}`, "skip", `Nie znaleziono przycisku dalej/zapisz na stronie ${pageNum}`));
        break;
      }
    }

    screenshot = await takeScreenshot(page);
    addStep(
      log(
        "formularz_wypelnienie",
        totalFilled > 0 ? "ok" : "skip",
        `Wypelniono lacznie ${totalFilled} pol na ${5} stronach`,
        screenshot
      )
    );

    if (autoSubmit) {
      // After filling form pages, need to go back to the overview/summary page
      // The overview page URL pattern: /efz/efz/formone/XXXX/9 (without page number)
      // or we need to click "back" / arrow / navigate to the summary

      // Try clicking back arrow or going to overview
      const backResult = await page.evaluate(() => {
        // Try back arrow link
        const backLinks = Array.from(document.querySelectorAll("a, button"));
        for (const link of backLinks) {
          const text = (link.textContent || "").trim().toLowerCase();
          const href = (link as HTMLAnchorElement).href || "";
          if (text.includes("wróć") || text.includes("wroc") || text.includes("powrót") || text.includes("powrot") ||
              text.includes("podsumowanie") || text.includes("summary") ||
              text === "←" || text === "⬅" || text.includes("back")) {
            (link as HTMLElement).click();
            return { found: true, text: (link.textContent || "").trim().substring(0, 40) };
          }
        }
        return { found: false, text: "" };
      });

      if (backResult.found) {
        await delay(2000);
        addStep(log("powrot_do_podsumowania", "ok", `Kliknieto: "${backResult.text}"`));
      } else {
        // Navigate back using browser history or go to the nabór page
        try {
          await page.goBack();
          await delay(2000);
          addStep(log("powrot_do_podsumowania", "ok", "Uzyto page.goBack()"));
        } catch {}
      }

      // Try to find and click "Wyślij zgłoszenie" - try multiple times with navigation
      let submitClicked = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const submitResult = await page.evaluate(() => {
          const submitKeywords = ["wyślij zgłoszenie", "wyslij zgloszenie"];
          const buttons = Array.from(document.querySelectorAll("a, button, input[type='submit'], [role='button']"));
          for (const btn of buttons) {
            const text = (btn.textContent || "").trim().toLowerCase();
            if (submitKeywords.some(kw => text.includes(kw))) {
              (btn as HTMLElement).click();
              return { clicked: true, text: (btn.textContent || "").trim().substring(0, 60) };
            }
          }
          // Also try by icon/class - the button has a green icon
          for (const btn of buttons) {
            const text = (btn.textContent || "").trim().toLowerCase();
            if (text.includes("wyślij") || text.includes("wyslij")) {
              (btn as HTMLElement).click();
              return { clicked: true, text: (btn.textContent || "").trim().substring(0, 60) };
            }
          }
          return { clicked: false, text: "" };
        });

        if (submitResult.clicked) {
          submitClicked = true;
          await delay(3000);

          // Check for confirmation dialog/popup and confirm if needed
          const confirmResult = await page.evaluate(() => {
            const confirmKeywords = ["tak", "potwierdz", "potwierdzam", "yes", "ok", "wyślij", "wyslij", "zatwierdz", "zatwierdź"];
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
          break;
        } else {
          // Try going back more
          if (attempt < 3) {
            try {
              await page.goBack();
              await delay(2000);
              addStep(log("powrot_proba", "ok", `Proba ${attempt}: goBack(). URL: ${page.url()}`));
            } catch {}
          }
        }
      }

      if (!submitClicked) {
        screenshot = await takeScreenshot(page);
        addStep(
          log(
            "wyslanie_wniosku",
            "skip",
            `Nie znaleziono przycisku "Wyslij zgloszenie" po 3 probach. Strona: ${page.url()}`,
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

// =====================================================
// FST Portal automation (fst-lodzkie.teradane.com)
// =====================================================
const FST_URL = "https://fst-lodzkie.teradane.com/";

export async function exploreFstPortal(login: string, password: string) {
  const steps: { name: string; screenshot: string; html: string; url: string; elements: any }[] = [];
  let browser: Browser | null = null;

  try {
    const chromiumPath = findChromiumPath();
    browser = await puppeteer.launch({
      headless: "shell" as any,
      executablePath: chromiumPath,
      args: [
        "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
        "--disable-gpu", "--no-zygote", "--disable-extensions",
        "--window-size=1280,900",
      ],
      protocolTimeout: 120000,
      timeout: 60000,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    const snap = async (name: string) => {
      const screenshot = await takeScreenshot(page);
      const html = await page.evaluate(() => document.body?.innerHTML?.substring(0, 5000) || "");
      const url = page.url();
      const elements = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button, a.btn, input[type='submit']"))
          .map(el => ({ tag: el.tagName, text: (el.textContent || "").trim().substring(0, 80), href: (el as any).href || "", id: el.id, cls: (el.className || "").substring(0, 60) }))
          .filter(x => x.text.length > 0);
        const links = Array.from(document.querySelectorAll("a.nav-link"))
          .map(el => ({ text: (el.textContent || "").trim().substring(0, 80), href: (el as any).href || "" }))
          .filter(x => x.text.length > 0);
        const inputs = Array.from(document.querySelectorAll("input, textarea, select"))
          .map(el => ({ tag: el.tagName, type: (el as any).type || "", name: (el as any).name || "", id: el.id, placeholder: (el as any).placeholder || "", value: (el as any).value?.substring(0, 30) || "" }));
        const texts = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, label, .card-title, .card-header"))
          .slice(0, 30)
          .map(el => ({ tag: el.tagName, text: (el.textContent || "").trim().substring(0, 120) }))
          .filter(x => x.text.length > 0);
        return { buttons: btns, links, inputs, texts };
      });
      steps.push({ name, screenshot, html: html.substring(0, 3000), url, elements });
    };

    // STEP 1: Go directly to login page
    await page.goto("https://fst-lodzkie.teradane.com/Login", { waitUntil: "networkidle2", timeout: 60000 });
    await delay(2000);
    await snap("1_login_page");

    // STEP 2: Fill login form - Blazor needs proper event dispatch
    // Clear and type email
    await page.click('input[name="model.Email"]', { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type('input[name="model.Email"]', login, { delay: 30 });
    // Dispatch events Blazor listens to
    await page.evaluate((val) => {
      const el = document.querySelector('input[name="model.Email"]') as HTMLInputElement;
      if (el) {
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    }, login);
    await delay(200);

    // Clear and type password
    await page.click('input[name="model.Haslo"]', { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type('input[name="model.Haslo"]', password, { delay: 30 });
    await page.evaluate((val) => {
      const el = document.querySelector('input[name="model.Haslo"]') as HTMLInputElement;
      if (el) {
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    }, password);
    await delay(200);

    await snap("2_login_filled");

    // STEP 3: Click the "Zaloguj" button using Puppeteer native click
    await page.click("button.btn-primary");
    await delay(6000);
    await snap("3_after_login");

    // STEP 4: Click "złożyć wniosek" link on the dashboard (Blazor - must use clicks, not goto)
    const wniosekClicked = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a"));
      for (const link of links) {
        const t = (link.textContent || "").trim().toLowerCase();
        if (t.includes("złożyć wniosek") || t.includes("zloz wniosek")) {
          (link as HTMLElement).click();
          return { clicked: true, text: (link.textContent || "").trim().substring(0, 80), href: link.href };
        }
      }
      // Try sidebar link
      for (const link of links) {
        const t = (link.textContent || "").trim().toLowerCase();
        if (t.includes("złóż wniosek")) {
          (link as HTMLElement).click();
          return { clicked: true, text: (link.textContent || "").trim().substring(0, 80), href: link.href };
        }
      }
      return { clicked: false, text: "", href: "" };
    });
    await delay(5000);
    await snap("4_nabory_page");

    // STEP 5: On nabor page, look for "Złóż wniosek" action button
    const zlozBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, a.btn, input[type='submit']"));
      const results = btns.map(b => ({ text: (b.textContent || "").trim().substring(0, 80), cls: (b.className || "").substring(0, 60) }));
      for (const btn of btns) {
        const t = (btn.textContent || "").trim().toLowerCase();
        if (t.includes("złóż wniosek") || t.includes("złóż")) {
          (btn as HTMLElement).click();
          return { clicked: true, text: (btn.textContent || "").trim(), allButtons: results };
        }
      }
      return { clicked: false, text: "", allButtons: results };
    });
    await delay(5000);
    await snap("5_after_zloz_click");

    // STEP 6: Check what's on the page now - type selection or form
    const pageAnalysis = await page.evaluate(() => {
      const radios = Array.from(document.querySelectorAll("input[type='radio']"));
      const selects = Array.from(document.querySelectorAll("select"));
      const inputs = Array.from(document.querySelectorAll("input:not([type='hidden']), textarea"));
      const buttons = Array.from(document.querySelectorAll("button, a.btn"));
      const allText = document.body?.innerText?.substring(0, 3000) || "";
      return {
        radios: radios.map(r => ({ name: (r as any).name, value: (r as any).value, id: r.id, label: r.closest("label")?.textContent?.trim()?.substring(0, 80) || r.parentElement?.textContent?.trim()?.substring(0, 80) || "" })),
        selects: selects.map(s => ({
          name: (s as any).name, id: s.id,
          options: Array.from((s as HTMLSelectElement).options).map(o => ({ value: o.value, text: o.textContent?.trim() })).slice(0, 15)
        })),
        inputs: inputs.map(i => ({ name: (i as any).name, type: (i as any).type, placeholder: (i as any).placeholder, id: i.id })),
        buttons: buttons.map(b => ({ text: (b.textContent || "").trim().substring(0, 80), cls: (b.className || "").substring(0, 40) })),
        bodyText: allText.substring(0, 2000),
      };
    });
    steps.push({ name: "6_page_analysis", screenshot: "", html: JSON.stringify(pageAnalysis, null, 2).substring(0, 4000), url: page.url(), elements: pageAnalysis });

    // Try clicking radio for "zamieszkanie" if available
    if (pageAnalysis.radios.length > 0) {
      await page.evaluate(() => {
        const radios = Array.from(document.querySelectorAll("input[type='radio']"));
        for (const r of radios) {
          const label = (r.closest("label")?.textContent || r.parentElement?.textContent || "").toLowerCase();
          if (label.includes("zamieszkanie") || label.includes("zamieszkuj") || label.includes("mieszk")) {
            (r as HTMLElement).click();
            return;
          }
        }
        if (radios.length > 0) (radios[0] as HTMLElement).click();
      });
      await delay(2000);
    }

    // Try selecting from dropdown if available
    if (pageAnalysis.selects.length > 0) {
      await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll("select"));
        for (const s of selects) {
          const opts = Array.from((s as HTMLSelectElement).options).filter(o => o.value);
          if (opts.length > 1) {
            (s as HTMLSelectElement).value = opts[1].value;
            s.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      });
      await delay(2000);
    }

    await snap("7_after_type_selection");

    // Explore the form fields
    const formFields = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("input:not([type='hidden']), textarea, select"));
      return all.map(el => ({
        tag: el.tagName,
        type: (el as any).type || "",
        name: (el as any).name || "",
        id: el.id,
        placeholder: (el as any).placeholder || "",
        required: (el as any).required || false,
        className: (el.className || "").substring(0, 50),
        label: el.closest("div")?.querySelector("label")?.textContent?.trim()?.substring(0, 80) || "",
        options: el.tagName === "SELECT" ? Array.from((el as HTMLSelectElement).options).map(o => ({ v: o.value, t: o.textContent?.trim() })).slice(0, 15) : [],
      }));
    });
    steps.push({ name: "8_form_fields", screenshot: "", html: JSON.stringify(formFields, null, 2), url: page.url(), elements: { formFields } });

    // Scroll and take more screenshots
    await page.evaluate(() => window.scrollBy(0, 500));
    await delay(1000);
    await snap("9_scroll_down");

    await page.evaluate(() => window.scrollBy(0, 500));
    await delay(1000);
    await snap("10_scroll_more");

    await page.evaluate(() => window.scrollBy(0, 500));
    await delay(1000);
    await snap("11_scroll_bottom");

  } catch (err: any) {
    steps.push({ name: "ERROR", screenshot: "", html: err.message + "\n" + err.stack, url: "", elements: {} });
  } finally {
    if (browser) try { await browser.close(); } catch {}
  }

  return { steps };
}

export async function runFstAutomationForParticipant(
  participant: ParticipantData,
  onProgress?: ProgressCallback,
  autoSubmit = true,
): Promise<AutomationResult> {
  const steps: StepLog[] = [];
  const startedAt = new Date().toISOString();
  let browser: Browser | null = null;
  let status: AutomationResult["status"] = "completed";

  const addStep = (s: StepLog) => {
    steps.push(s);
    onProgress?.(participant.id, s);
  };

  async function blazorType(page: Page, selector: string, value: string) {
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type(selector, value, { delay: 20 });
    await page.evaluate((sel, val) => {
      const el = document.querySelector(sel) as HTMLInputElement;
      if (el) {
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    }, selector, value);
    await delay(100);
  }

  try {
    const chromiumPath = findChromiumPath();
    browser = await puppeteer.launch({
      headless: "shell" as any,
      executablePath: chromiumPath,
      args: [
        "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
        "--disable-gpu", "--no-zygote", "--disable-extensions",
        "--disable-background-networking", "--disable-default-apps",
        "--disable-sync", "--disable-translate",
        "--metrics-recording-only", "--mute-audio", "--no-first-run",
        "--js-flags=--max-old-space-size=128",
        "--window-size=1280,900", "--disable-features=site-per-process",
      ],
      protocolTimeout: 120000,
      timeout: 60000,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    addStep(log("init", "ok", "Uruchomiono przegladarke (FST)"));

    // STEP 1: Go to login page
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto("https://fst-lodzkie.teradane.com/Login", { waitUntil: "networkidle2", timeout: 60000 });
        break;
      } catch (navErr: any) {
        console.log(`[fst] Login page load attempt ${attempt}/3 failed: ${navErr.message}`);
        if (attempt === 3) throw navErr;
        await delay(2000);
      }
    }
    await delay(2000);
    let screenshot = await takeScreenshot(page);
    addStep(log("otwarcie_portalu", "ok", `Otwarto strone logowania FST. URL: ${page.url()}`, screenshot));

    // STEP 2: Fill login form (Blazor Server - must use page.type + event dispatch)
    const emailExists = await page.$('input[name="model.Email"]');
    const passExists = await page.$('input[name="model.Haslo"]');

    if (!emailExists || !passExists) {
      addStep(log("logowanie", "error", "Nie znaleziono pol logowania (model.Email / model.Haslo)"));
      status = "error";
      throw new Error("Brak pol logowania");
    }

    await blazorType(page, 'input[name="model.Email"]', participant.loginPortal);
    await blazorType(page, 'input[name="model.Haslo"]', participant.haslo);

    addStep(log("logowanie_wypelnienie", "ok", `Wypelniono: email=${participant.loginPortal}`));

    // STEP 3: Click "Zaloguj" button
    await page.click("button.btn-primary");
    await delay(6000);
    screenshot = await takeScreenshot(page);
    const currentUrl = page.url();
    const isLoggedIn = !currentUrl.toLowerCase().includes("/login");

    if (!isLoggedIn) {
      const errorMsg = await page.evaluate(() => {
        const alerts = document.querySelectorAll(".alert, .text-danger, .validation-message, .validation-summary-errors");
        return Array.from(alerts).map(a => a.textContent?.trim()).filter(t => t).join("; ");
      });
      addStep(log("logowanie_submit", "error", `Logowanie nieudane. URL: ${currentUrl}. Bledy: ${errorMsg || "brak"}`, screenshot));
      status = "error";
      throw new Error(`Logowanie nieudane: ${errorMsg || "brak bledu na stronie"}`);
    }

    addStep(log("logowanie_submit", "ok", `Zalogowano. URL: ${currentUrl}`, screenshot));

    // STEP 4: Navigate to Nabory via link click (NOT page.goto - it breaks Blazor session)
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a"));
      for (const link of links) {
        const href = link.getAttribute("href") || "";
        const text = (link.textContent || "").trim().toLowerCase();
        if (href.toLowerCase() === "nabory" || text.includes("złóż wniosek") || text.includes("nabory")) {
          (link as HTMLElement).click();
          return;
        }
      }
    });
    await delay(6000);
    screenshot = await takeScreenshot(page);

    // Wait for Blazor to render the nabory list (up to 15s)
    for (let waitAttempt = 0; waitAttempt < 5; waitAttempt++) {
      const hasContent = await page.evaluate(() => {
        const body = document.body?.innerText || "";
        return body.includes("Nabór") || body.includes("nabór") || body.includes("Złóż") || body.includes("Kumulacja");
      });
      if (hasContent) break;
      await delay(3000);
    }

    // Debug: log all page content and buttons
    const naborPageInfo = await page.evaluate(() => {
      const text = document.body?.innerText?.substring(0, 2000) || "";
      const allElements = Array.from(document.querySelectorAll("button, a, input[type='submit']")).filter(
        b => !(b as Element).closest("nav") && !(b as Element).closest(".navbar")
      ).map(b => ({
        tag: b.tagName,
        text: (b.textContent || "").trim().substring(0, 80),
        cls: (b as Element).className?.substring(0, 50) || "",
        href: b.getAttribute?.("href")?.substring(0, 50) || "",
      }));
      return { text: text.substring(0, 1000), elements: allElements };
    });
    addStep(log("nawigacja_nabory", "ok",
      `Nabory. URL: ${page.url()}. Elementy: ${JSON.stringify(naborPageInfo.elements.map(b => `${b.tag}:${b.text}:${b.cls}`)).substring(0, 300)}. Tekst: ${naborPageInfo.text.substring(0, 200)}`,
      screenshot));

    // STEP 5: Click action button — search in content area, exclude navbar
    let zlozResult = await page.evaluate(() => {
      const keywords = ["złóż wniosek", "kontynuuj", "edytuj wniosek", "przejdź do wniosku", "otwórz"];
      const nonNavElements = Array.from(document.querySelectorAll("button, a, input[type='submit']")).filter(
        b => !(b as Element).closest("nav") && !(b as Element).closest(".navbar") && !b.classList.contains("nav-link")
      );
      for (const kw of keywords) {
        for (const el of nonNavElements) {
          const t = (el.textContent || "").trim().toLowerCase();
          if (t.includes(kw)) {
            (el as HTMLElement).click();
            return { clicked: true, text: (el.textContent || "").trim() };
          }
        }
      }
      // Fallback: any btn-primary/btn-danger/btn-success not in nav
      for (const el of nonNavElements) {
        const cls = (el as Element).className || "";
        if (cls.includes("btn-primary") || cls.includes("btn-danger") || cls.includes("btn-success")) {
          (el as HTMLElement).click();
          return { clicked: true, text: (el.textContent || "").trim() + " (color-btn)" };
        }
      }
      // Last resort: any button in a table or card
      const tableBtn = document.querySelector("table button, .card button, .card a");
      if (tableBtn) {
        (tableBtn as HTMLElement).click();
        return { clicked: true, text: (tableBtn.textContent || "").trim() + " (table-btn)" };
      }
      return { clicked: false, text: "" };
    });

    await delay(5000);
    screenshot = await takeScreenshot(page);

    // Check page state
    const pageText = await page.evaluate(() => document.body?.innerText?.substring(0, 3000) || "");
    const formCheckUrl = page.url().toLowerCase();
    const alreadySubmitted = pageText.toLowerCase().includes("złożono wniosek w projekcie");
    const alreadyOnForm = formCheckUrl.includes("wybierzrodzajwniosku") || formCheckUrl.includes("mieszkamlodzkie") || formCheckUrl.includes("formularz");
    const hasFormElements = await page.evaluate(() => document.querySelectorAll("select").length >= 2);

    if (alreadySubmitted) {
      addStep(log("wniosek_juz_zlozony", "ok",
        `Wniosek juz zostal zlozony wczesniej dla tego konta. URL: ${page.url()}`, screenshot));
      status = "completed";
    } else if (zlozResult.clicked || alreadyOnForm || hasFormElements) {
      addStep(log("klik_zloz_wniosek", zlozResult.clicked ? "ok" : "skip",
        zlozResult.clicked ? `Kliknieto "${zlozResult.text}". URL: ${page.url()}` : `Juz na stronie formularza. URL: ${page.url()}`, screenshot));

      await delay(3000);
      screenshot = await takeScreenshot(page);

      // ===== KROK A: Formularz zgloszeniowy (strona 1) =====
      // Dwa dropdowny: 1) "Nie prowadze dzialalnosci" 2) "Mieszkam w woj. lodzkim" + upload US PDF
      // Must use page.select() for Blazor Server to register changes
      const step1Selects = await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll("select"));
        return selects.map((s, i) => {
          if (!s.id) s.id = `__step1_sel_${i}_${Date.now()}`;
          const opts = Array.from((s as HTMLSelectElement).options).map(o => ({ value: o.value, text: o.text }));
          return { id: s.id, opts: opts.filter(o => o.value && o.value !== "" && o.value !== "0") };
        });
      });

      const step1Log: string[] = [];
      for (let i = 0; i < step1Selects.length; i++) {
        const sel = step1Selects[i];
        if (sel.opts.length === 0) continue;
        let chosen;
        if (i === 0) {
          chosen = sel.opts.find(o => o.text.toLowerCase().includes("nie prowadzę") || o.text.toLowerCase().includes("działalności")) || sel.opts[0];
        } else {
          chosen = sel.opts.find(o => o.text.toLowerCase().includes("mieszkam")) || sel.opts[0];
        }
        try {
          await page.select(`#${sel.id}`, chosen.value);
          step1Log.push(`${i === 0 ? "działalność" : "rodzaj"}=${chosen.text.substring(0, 40)}`);
        } catch {
          step1Log.push(`${i === 0 ? "działalność" : "rodzaj"}_error`);
        }
        await delay(1000);
      }
      addStep(log("formularz_zgloszeniowy_selecty", "ok",
        `Dropdowny strona 1: [${step1Log.join(", ")}]`, screenshot));

      // Upload Zaswiadczenie z US (PDF)
      const dummyPdfPath = "/tmp/dummy_zaswiadczenie.pdf";
      const fileInputsStep1 = await page.$$("input[type='file']");
      if (fileInputsStep1.length > 0) {
        try {
          await fileInputsStep1[0].uploadFile(dummyPdfPath);
          await delay(2000);
          addStep(log("upload_us", "ok", "Zaladowano PDF (zaswiadczenie US)"));
        } catch (e: any) {
          addStep(log("upload_us", "skip", `Upload US nieudany: ${e.message}`));
        }
      }

      // Click "Przejdź dalej"
      const przejdzResult = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button, input[type='submit']"));
        for (const btn of btns) {
          const t = (btn.textContent || "").trim().toLowerCase();
          if (t.includes("przejdź dalej") || t.includes("przejdz dalej") || t.includes("dalej")) {
            (btn as HTMLElement).click();
            return { clicked: true, text: (btn.textContent || "").trim() };
          }
        }
        return { clicked: false, text: "" };
      });

      if (przejdzResult.clicked) {
        await delay(6000);
        screenshot = await takeScreenshot(page);
        addStep(log("przejdz_dalej", "ok",
          `Kliknieto "${przejdzResult.text}". URL: ${page.url()}`, screenshot));
      } else {
        screenshot = await takeScreenshot(page);
        addStep(log("przejdz_dalej", "error", `Nie znaleziono "Przejdz dalej". URL: ${page.url()}`, screenshot));
        status = "error";
        throw new Error("Brak przycisku Przejdz dalej");
      }

      // ===== KROK B: Formularz glowny =====
      await delay(3000);

      // Parse address: "ul. Traktorowa 89 m 11" → ulica="Traktorowa", numerDomu="89 m 11"
      const adresMatch = participant.adres.match(/^ul\.?\s*(.+?)\s+(\d+.*)$/i);
      const ulicaName = adresMatch ? adresMatch[1] : participant.adres.replace(/^ul\.?\s*/i, "");
      const numerDomuLokalu = adresMatch ? adresMatch[2] : "";

      // Helper: Blazor-compatible select - uses page.select() for proper change events
      async function blazorSelectByIndex(page: Page, selectIndex: number, searchText: string, waitMs = 3000) {
        const info = await page.evaluate((idx) => {
          const selects = Array.from(document.querySelectorAll("select"));
          if (idx >= selects.length) return { exists: false, id: "", optCount: 0, opts: [] as string[] };
          const s = selects[idx] as HTMLSelectElement;
          if (!s.id) s.id = `__blazor_sel_${idx}_${Date.now()}`;
          const opts = Array.from(s.options).map(o => ({ value: o.value, text: o.text }));
          return { exists: true, id: s.id, optCount: opts.length, opts: opts.filter(o => o.value && o.value !== "" && o.value !== "0") };
        }, selectIndex);

        if (!info.exists) return { ok: false, msg: `select[${selectIndex}] nie istnieje` };
        if (info.opts.length === 0) return { ok: false, msg: `select[${selectIndex}] brak opcji (${info.optCount} total)` };

        const match = info.opts.find(o => o.text.toLowerCase().includes(searchText.toLowerCase()));
        const chosen = match || info.opts[0];
        const label = match ? chosen.text : `fallback: ${chosen.text}`;

        try {
          await page.select(`#${info.id}`, chosen.value);
          await page.evaluate((id) => {
            const el = document.getElementById(id) as HTMLSelectElement;
            if (el) {
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, info.id);
        } catch {
          await page.evaluate((id, val) => {
            const el = document.getElementById(id) as HTMLSelectElement;
            if (el) {
              el.value = val;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, info.id, chosen.value);
        }
        await delay(waitMs);
        return { ok: true, msg: label };
      }

      const addrLog: string[] = [];

      // 1. Województwo (index 0) → ŁÓDZKIE  (wait 4s for Blazor to load next)
      const woj = await blazorSelectByIndex(page, 0, "łódzkie", 5000);
      addrLog.push(`woj: ${woj.msg}`);

      // 2. Powiat (index 1) → Łódź (wait for options to populate from Blazor)
      const powiatSearch = participant.miasto.toLowerCase() === "łódź" ? "łódź" :
                           participant.miasto.toLowerCase() === "maków" ? "skierniewi" : participant.miasto;
      for (let retry = 0; retry < 3; retry++) {
        const pow = await blazorSelectByIndex(page, 1, powiatSearch, 5000);
        addrLog.push(`powiat: ${pow.msg}`);
        if (pow.ok) break;
        await delay(3000);
      }

      // 3. Gmina (index 2)
      const gminaSearch = participant.miasto.toLowerCase() === "łódź" ? "łódź" : participant.miasto;
      for (let retry = 0; retry < 3; retry++) {
        const gm = await blazorSelectByIndex(page, 2, gminaSearch, 5000);
        addrLog.push(`gmina: ${gm.msg}`);
        if (gm.ok) break;
        await delay(3000);
      }

      // 4. Miejscowość (index 3)
      for (let retry = 0; retry < 3; retry++) {
        const mc = await blazorSelectByIndex(page, 3, participant.miasto.toLowerCase() === "łódź" ? "łódź" : participant.miasto, 5000);
        addrLog.push(`miejscowosc: ${mc.msg}`);
        if (mc.ok) break;
        await delay(3000);
      }

      // 5. Ulica (index 4) → dropdown search by street name
      for (let retry = 0; retry < 3; retry++) {
        const ul = await blazorSelectByIndex(page, 4, ulicaName, 4000);
        addrLog.push(`ulica: ${ul.msg}`);
        if (ul.ok) break;
        await delay(3000);
      }

      addStep(log("adres_selecty", "ok", `Adres: [${addrLog.join("; ")}]`));

      // Fill text inputs: Numer domu/lokalu, Kod pocztowy, Nazwa szkoły
      const textInputs = await page.$$("input[type='text']:not([readonly]):not([disabled])");
      const textLog: string[] = [];

      for (const inp of textInputs) {
        const attrs = await page.evaluate(el => ({
          name: el.name || "",
          id: el.id || "",
          placeholder: el.placeholder || "",
          value: el.value || "",
          parentText: (() => {
            let node: Element | null = el;
            let text = "";
            for (let i = 0; i < 3 && node; i++) {
              node = node.parentElement;
              if (node) {
                const label = node.querySelector("label, strong, b, h5, h6");
                if (label) { text += " " + (label.textContent || ""); }
              }
            }
            return (text + " " + (el.previousElementSibling?.textContent || "")).toLowerCase().substring(0, 200);
          })(),
        }), inp);

        if (attrs.value) continue;
        const allText = `${attrs.name} ${attrs.id} ${attrs.placeholder} ${attrs.parentText}`;
        const selector = attrs.name ? `input[name="${attrs.name}"]` : attrs.id ? `#${attrs.id}` : null;
        if (!selector) continue;

        try {
          if (allText.includes("numer dom") || allText.includes("domu") || allText.includes("lokalu") || allText.includes("nr dom") || allText.includes("budyn")) {
            await blazorType(page, selector, numerDomuLokalu || "1");
            textLog.push("numer_domu_lokalu");
          } else if (allText.includes("kod") || allText.includes("poczt")) {
            await blazorType(page, selector, participant.kodPocztowy);
            textLog.push("kod_pocztowy");
          } else if (allText.includes("szkoł") || allText.includes("szkol") || allText.includes("uczelni") || allText.includes("nauk") || allText.includes("pobierania")) {
            await blazorType(page, selector, "Brak");
            textLog.push("nazwa_szkoly");
          } else {
            await blazorType(page, selector, "Brak");
            textLog.push(`other:${attrs.name || attrs.id}`);
          }
        } catch {}
      }

      // Fill textareas ("Inne" → "Brak")
      const textareas = await page.$$("textarea:not([readonly]):not([disabled])");
      for (const ta of textareas) {
        const hasValue = await page.evaluate(el => !!(el as HTMLTextAreaElement).value, ta);
        if (!hasValue) {
          try {
            const taSelector = await page.evaluate(el => {
              return el.name ? `textarea[name="${el.name}"]` : el.id ? `textarea#${el.id}` : null;
            }, ta);
            if (taSelector) {
              await blazorType(page, taSelector, "Brak");
              textLog.push("textarea_inne");
            }
          } catch {}
        }
      }

      addStep(log("pola_tekstowe", "ok", `Pola: [${textLog.join(", ")}]`));

      // Upload all file inputs (dane osobowe, zaswiadczenie PUP, wyksztalcenie)
      const allFileInputs = await page.$$("input[type='file']");
      let uploadCount = 0;
      for (const fi of allFileInputs) {
        try {
          await fi.uploadFile(dummyPdfPath);
          uploadCount++;
          await delay(2000);
        } catch {}
      }
      addStep(log("upload_dokumenty", "ok", `Zaladowano ${uploadCount}/${allFileInputs.length} plikow PDF`));

      // Fill remaining selects using page.select() for Blazor compatibility
      const selectsInfo = await page.evaluate((notatkiRaw) => {
        const selects = Array.from(document.querySelectorAll("select"));
        const toFill: { id: string; value: string; label: string }[] = [];

        for (let i = 0; i < selects.length; i++) {
          const s = selects[i] as HTMLSelectElement;
          if (s.value && s.value !== "" && s.value !== "0") continue;
          if (!s.id) s.id = `__blazor_status_${i}_${Date.now()}`;
          const parent = s.closest(".form-group, .mb-3, .col, div") || s.parentElement;
          const nearby = (parent?.textContent || "").toLowerCase().substring(0, 300);
          const prevText = (s.previousElementSibling?.textContent || "").toLowerCase();
          const labelText = `${nearby} ${prevText}`;
          const opts = Array.from(s.options);
          const notatki = notatkiRaw.toLowerCase();

          let chosen: { value: string; text: string } | null = null;
          let fieldName = "";

          if (labelText.includes("rynku pracy") || labelText.includes("status wnioskodawcy na rynku")) {
            fieldName = "status_pracy";
            if (notatki.includes("zatrudnion")) chosen = opts.find(o => o.text.toLowerCase().includes("zatrudnion")) || null;
            if (!chosen && (notatki.includes("bezrobotn") || notatki.includes("zarejestrowana w pup") || notatki.includes("zarejestrowana w up")))
              chosen = opts.find(o => o.text.toLowerCase().includes("bezrobotn") && o.text.toLowerCase().includes("pup")) || null;
            if (!chosen) chosen = opts.find(o => o.text.toLowerCase().includes("bezrobotn")) || null;
          } else if (labelText.includes("wykształcen") || labelText.includes("wyksztalcen") || labelText.includes("isced")) {
            fieldName = "wyksztalcenie";
            if (notatki.includes("brak formal")) chosen = opts.find(o => o.text.toLowerCase().includes("isced 0") || o.text.toLowerCase().includes("brak")) || null;
            else if (notatki.includes("zawodowe")) chosen = opts.find(o => o.text.toLowerCase().includes("zawodow")) || null;
            else if (notatki.includes("średnie niepełne") || notatki.includes("srednie niepelne")) chosen = opts.find(o => o.text.toLowerCase().includes("gimnazjaln")) || null;
            else if (notatki.includes("średnie") || notatki.includes("srednie")) chosen = opts.find(o => o.text.toLowerCase().includes("ponadgimnazjaln") || o.text.toLowerCase().includes("isced 3")) || null;
            if (!chosen) chosen = opts.find(o => o.text.toLowerCase().includes("isced 0") || o.text.toLowerCase().includes("brak")) || null;
          } else if (labelText.includes("niepełnospraw") || labelText.includes("niepelnospraw")) {
            fieldName = "niepelnosprawnosc";
            chosen = opts.find(o => o.text.toLowerCase().trim() === "nie") || null;
          } else if (labelText.includes("mniejszoś") || labelText.includes("mniejszos") || labelText.includes("etniczn")) {
            fieldName = "mniejszosc";
            chosen = opts.find(o => o.text.toLowerCase().trim() === "nie") || null;
          } else if (labelText.includes("obcego pochodzen")) {
            fieldName = "obce_pochodzenie";
            chosen = opts.find(o => o.text.toLowerCase().trim() === "nie") || null;
          } else if (labelText.includes("bezdomn") || labelText.includes("wykluczeni")) {
            fieldName = "bezdomnosc";
            chosen = opts.find(o => o.text.toLowerCase().trim() === "nie") || null;
          } else if (labelText.includes("pomocy społ") || labelText.includes("pomocy spol") || labelText.includes("świadczeń pomocy")) {
            fieldName = "pomoc_spol";
            chosen = opts.find(o => o.text.toLowerCase().trim() === "nie") || null;
          } else {
            fieldName = `other_${i}`;
            const nonEmpty = opts.filter(o => o.value && o.value !== "" && o.value !== "0");
            if (nonEmpty.length > 0) chosen = nonEmpty[0];
          }

          if (chosen) {
            toFill.push({ id: s.id, value: chosen.value, label: `${fieldName}=${chosen.text.substring(0, 50)}` });
          }
        }
        return toFill;
      }, participant.notatki || "");

      const selectsLog: string[] = [];
      for (const sf of selectsInfo) {
        try {
          await page.select(`#${sf.id}`, sf.value);
          await page.evaluate((id) => {
            const el = document.getElementById(id) as HTMLSelectElement;
            if (el) {
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, sf.id);
          selectsLog.push(sf.label);
        } catch {
          await page.evaluate((id, val) => {
            const el = document.getElementById(id) as HTMLSelectElement;
            if (el) { el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }
          }, sf.id, sf.value);
          selectsLog.push(sf.label);
        }
        await delay(500);
      }

      addStep(log("selecty_statusy", "ok", `Selecty: [${selectsLog.join("; ")}]`));

      // Checkboxes - SELECTIVE: only specific ones should be checked
      await page.evaluate(() => {
        const cbs = Array.from(document.querySelectorAll("input[type='checkbox']")) as HTMLInputElement[];
        for (const cb of cbs) {
          if (cb.checked || cb.disabled) continue;
          const parent = cb.closest(".form-group, .mb-3, div, label") || cb.parentElement;
          const labelText = (parent?.textContent || "").toLowerCase();

          const shouldCheck =
            labelText.includes("nie potrzebuję") ||
            labelText.includes("nie potrzebuje") ||
            labelText.includes("dostępnościow") ||
            labelText.includes("zainteresowany") ||
            labelText.includes("doradztw") ||
            labelText.includes("doradcy zawodowego") ||
            labelText.includes("akceptuję") ||
            labelText.includes("akceptuje") ||
            labelText.includes("oświadczen") ||
            labelText.includes("oswiadczen");

          if (shouldCheck) cb.click();
        }
      });
      await delay(1000);

      // Scroll to bottom
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(2000);

      screenshot = await takeScreenshot(page);
      addStep(log("formularz_gotowy", "ok", `Formularz wypelniony. URL: ${page.url()}`, screenshot));

      if (autoSubmit) {
        const submitResult = await page.evaluate(() => {
          const keywords = ["złóż wniosek", "wyślij", "zapisz", "zatwierdź"];
          const btns = Array.from(document.querySelectorAll("button, input[type='submit']"));
          for (const btn of btns) {
            const t = (btn.textContent || "").trim().toLowerCase();
            if (keywords.some(kw => t.includes(kw))) {
              (btn as HTMLElement).click();
              return { clicked: true, text: (btn.textContent || "").trim() };
            }
          }
          return { clicked: false, text: "" };
        });

        await delay(5000);
        screenshot = await takeScreenshot(page);

        if (submitResult.clicked) {
          addStep(log("wyslanie_wniosku", "ok",
            `Kliknieto "${submitResult.text}". URL: ${page.url()}`, screenshot));
          status = "completed";
        } else {
          addStep(log("wyslanie_wniosku", "skip",
            `Nie znaleziono przycisku wyslania. URL: ${page.url()}`, screenshot));
          status = "stopped";
        }
      } else {
        screenshot = await takeScreenshot(page);
        addStep(log("stop_przed_wyslaniem", "stop", "Automatyczne wyslanie wylaczone.", screenshot));
        status = "stopped";
      }
    } else {
      addStep(log("klik_zloz_wniosek", "skip",
        `Nie znaleziono przycisku "Zloz wniosek" w tabeli naborow. URL: ${page.url()}`, screenshot));
      status = "stopped";
    }

  } catch (err: any) {
    if (!steps.some(s => s.status === "error")) {
      steps.push(log("blad_krytyczny", "error", `Blad: ${err.message}`));
    }
    status = "error";
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
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

// ========== FST TWO-PHASE SYSTEM: Pre-login + Submit ==========
// Uses ONE shared browser with MULTIPLE TABS (pages) to save memory

export interface FstSession {
  participantId: number;
  imie: string;
  nazwisko: string;
  loginPortal: string;
  page: Page;
  status: "logging_in" | "ready" | "submitting" | "done" | "error";
  error?: string;
  steps: StepLog[];
  readyAt?: string;
}

let fstSharedBrowser: Browser | null = null;
const fstSessions: Map<number, FstSession> = new Map();

export function getFstSessions(): Map<number, FstSession> {
  return fstSessions;
}

export function getFstSessionsStatus(): Array<{
  participantId: number;
  imie: string;
  nazwisko: string;
  loginPortal: string;
  status: string;
  error?: string;
  readyAt?: string;
  stepsCount: number;
  lastStep?: string;
}> {
  const result: any[] = [];
  fstSessions.forEach((s, pid) => {
    result.push({
      participantId: pid,
      imie: s.imie,
      nazwisko: s.nazwisko,
      loginPortal: s.loginPortal,
      status: s.status,
      error: s.error,
      readyAt: s.readyAt,
      stepsCount: s.steps.length,
      lastStep: s.steps.length > 0 ? `${s.steps[s.steps.length - 1].step}: ${s.steps[s.steps.length - 1].message.substring(0, 100)}` : undefined,
    });
  });
  return result;
}

async function ensureSharedBrowser(): Promise<Browser> {
  if (fstSharedBrowser) {
    try {
      const pages = await fstSharedBrowser.pages();
      if (pages) return fstSharedBrowser;
    } catch {}
  }
  const chromiumPath = findChromiumPath();
  fstSharedBrowser = await puppeteer.launch({
    headless: "shell" as any,
    executablePath: chromiumPath,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
      "--disable-gpu", "--no-zygote", "--disable-extensions",
      "--disable-background-networking", "--disable-default-apps",
      "--disable-sync", "--disable-translate",
      "--metrics-recording-only", "--mute-audio", "--no-first-run",
      "--js-flags=--max-old-space-size=256",
      "--window-size=1280,900", "--disable-features=site-per-process",
    ],
    protocolTimeout: 180000,
    timeout: 60000,
  });
  return fstSharedBrowser;
}

async function fstPreloginSingle(
  browser: Browser,
  participant: ParticipantData,
  onProgress?: ProgressCallback,
): Promise<{ success: boolean; error?: string; steps: StepLog[] }> {
  const steps: StepLog[] = [];
  const addStep = (s: StepLog) => {
    steps.push(s);
    onProgress?.(participant.id, s);
  };

  const existing = fstSessions.get(participant.id);
  if (existing && (existing.status === "ready" || existing.status === "submitting")) {
    return { success: true, steps: [log("prelogin", "skip", "Sesja juz aktywna")] };
  }
  if (existing) {
    try { await existing.page.close(); } catch {}
    fstSessions.delete(participant.id);
  }

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    const session: FstSession = {
      participantId: participant.id,
      imie: participant.imie,
      nazwisko: participant.nazwisko,
      loginPortal: participant.loginPortal,
      page,
      status: "logging_in",
      steps,
    };
    fstSessions.set(participant.id, session);

    addStep(log("prelogin_init", "ok", `Otwarto zakladke dla ${participant.imie} ${participant.nazwisko}`));

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto("https://fst-lodzkie.teradane.com/Login", { waitUntil: "networkidle2", timeout: 60000 });
        break;
      } catch (navErr: any) {
        if (attempt === 3) throw navErr;
        await delay(2000);
      }
    }
    await delay(2000);

    async function blazorType(sel: string, value: string) {
      await page.click(sel, { clickCount: 3 });
      await page.keyboard.press("Backspace");
      await page.type(sel, value, { delay: 20 });
      await page.evaluate((s, v) => {
        const el = document.querySelector(s) as HTMLInputElement;
        if (el) {
          el.value = v;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
        }
      }, sel, value);
      await delay(100);
    }

    await blazorType('input[name="model.Email"]', participant.loginPortal);
    await blazorType('input[name="model.Haslo"]', participant.haslo);
    addStep(log("prelogin_login_fill", "ok", `Wypelniono: ${participant.loginPortal}`));

    await page.click("button.btn-primary");
    await delay(6000);

    const currentUrl = page.url();
    if (currentUrl.toLowerCase().includes("/login")) {
      const errorMsg = await page.evaluate(() => {
        const alerts = document.querySelectorAll(".alert, .text-danger, .validation-message");
        return Array.from(alerts).map(a => a.textContent?.trim()).filter(t => t).join("; ");
      });
      throw new Error(`Logowanie nieudane: ${errorMsg || "brak bledu"}`);
    }
    let screenshot = await takeScreenshot(page);
    addStep(log("prelogin_login_ok", "ok", `Zalogowano. URL: ${currentUrl}`, screenshot));

    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a"));
      for (const link of links) {
        const text = (link.textContent || "").trim();
        if (text === "Złóż wniosek") {
          (link as HTMLElement).click();
          return;
        }
      }
      for (const link of links) {
        const href = link.getAttribute("href") || "";
        if (href.toLowerCase() === "nabory") {
          (link as HTMLElement).click();
          return;
        }
      }
    });
    await delay(6000);

    for (let waitAttempt = 0; waitAttempt < 5; waitAttempt++) {
      const hasContent = await page.evaluate(() => {
        const body = document.body?.innerText || "";
        return body.includes("Nabór") || body.includes("nabór") || body.includes("Złóż") || body.includes("Wybierz");
      });
      if (hasContent) break;
      await delay(3000);
    }

    screenshot = await takeScreenshot(page);
    const pageInfo = await page.evaluate(() => ({
      url: window.location.href,
      text: document.body?.innerText?.substring(0, 500) || "",
    }));

    addStep(log("prelogin_ready", "ok",
      `Gotowy: ${pageInfo.url}. Tekst: ${pageInfo.text.substring(0, 150)}`,
      screenshot));

    session.status = "ready";
    session.readyAt = new Date().toISOString();
    return { success: true, steps };

  } catch (err: any) {
    addStep(log("prelogin_error", "error", `Blad: ${err.message}`));
    const session = fstSessions.get(participant.id);
    if (session) {
      session.status = "error";
      session.error = err.message;
    }
    return { success: false, error: err.message, steps };
  }
}

export async function fstPreloginAll(
  participants: ParticipantData[],
  onProgress?: ProgressCallback,
  concurrency = 2,
): Promise<Array<{ participantId: number; success: boolean; error?: string }>> {
  const browser = await ensureSharedBrowser();
  const results: Array<{ participantId: number; success: boolean; error?: string }> = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < participants.length) {
      const idx = nextIndex++;
      const p = participants[idx];
      console.log(`[fst-prelogin] Starting ${p.imie} ${p.nazwisko} (${idx + 1}/${participants.length})`);
      const result = await fstPreloginSingle(browser, p, onProgress);
      results.push({ participantId: p.id, success: result.success, error: result.error });
    }
  }

  const workerCount = Math.min(concurrency, participants.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function fstSubmitParticipant(
  participant: ParticipantData,
  onProgress?: ProgressCallback,
  autoSubmit = true,
): Promise<AutomationResult> {
  const startedAt = new Date().toISOString();
  const session = fstSessions.get(participant.id);

  if (!session || session.status !== "ready") {
    return {
      participantId: participant.id,
      imie: participant.imie,
      nazwisko: participant.nazwisko,
      loginPortal: participant.loginPortal,
      status: "error",
      steps: [log("submit_error", "error", `Brak gotowej sesji (status: ${session?.status || "nie istnieje"})`)],
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  session.status = "submitting";
  const page = session.page;
  const steps: StepLog[] = [...session.steps];
  let status: AutomationResult["status"] = "completed";
  const pdfPath = "/tmp/dummy_zaswiadczenie.pdf";

  const addStep = (s: StepLog) => {
    steps.push(s);
    session.steps.push(s);
    onProgress?.(participant.id, s);
  };

  async function blazorTypeFast(sel: string, value: string) {
    await page.evaluate((s, v) => {
      const el = document.querySelector(s) as HTMLInputElement;
      if (el) {
        el.focus();
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    }, sel, value);
  }

  async function blazorSelectFast(selectIndex: number, searchText: string, waitMs = 500) {
    const info = await page.evaluate((idx) => {
      const selects = Array.from(document.querySelectorAll("select"));
      if (idx >= selects.length) return { exists: false, id: "", opts: [] as any[] };
      const s = selects[idx] as HTMLSelectElement;
      if (!s.id) s.id = `__fst_q_${idx}_${Date.now()}`;
      return {
        exists: true,
        id: s.id,
        opts: Array.from(s.options).filter(o => o.value && o.value !== "" && o.value !== "0").map(o => ({ value: o.value, text: o.text })),
      };
    }, selectIndex);

    if (!info.exists || info.opts.length === 0) return { ok: false, msg: `sel[${selectIndex}] brak` };

    const match = info.opts.find(o => o.text.toLowerCase().includes(searchText.toLowerCase()));
    const chosen = match || info.opts[0];

    await page.select(`#${info.id}`, chosen.value).catch(() => {});
    await page.evaluate((id) => {
      const el = document.getElementById(id) as HTMLSelectElement;
      if (el) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, info.id);
    if (waitMs > 0) await delay(waitMs);
    return { ok: true, msg: chosen.text.substring(0, 30) };
  }

  async function uploadAllFiles() {
    const fileInputs = await page.$$("input[type='file']");
    let count = 0;
    for (const fi of fileInputs) {
      try { await fi.uploadFile(pdfPath); count++; } catch {}
    }
    return count;
  }

  try {
    const currentPageText = await page.evaluate(() => document.body?.innerText?.substring(0, 2000) || "");
    let screenshot: string = "";

    addStep(log("submit_start", "ok", `START. URL: ${page.url()}`));

    if (currentPageText.includes("Brak aktualnych naborów")) {
      await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a"));
        const homeLink = links.find(l => l.getAttribute("href") === "" || l.getAttribute("href") === "/");
        if (homeLink) (homeLink as HTMLElement).click();
      });
      await delay(500);
      await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a"));
        for (const link of links) {
          if ((link.textContent || "").trim() === "Złóż wniosek") { (link as HTMLElement).click(); return; }
        }
        for (const link of links) {
          if ((link.getAttribute("href") || "").toLowerCase() === "nabory") { (link as HTMLElement).click(); return; }
        }
      });
      await delay(2000);
      for (let w = 0; w < 10; w++) {
        const ok = await page.evaluate(() => !document.body?.innerText?.includes("Brak aktualnych naborów"));
        if (ok) break;
        await delay(1000);
      }
    }

    const afterText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || "");
    if (afterText.includes("Brak aktualnych naborów")) {
      addStep(log("submit_no_nabor", "error", "Brak aktualnych naborow"));
      session.status = "error";
      return { participantId: participant.id, imie: participant.imie, nazwisko: participant.nazwisko,
        loginPortal: participant.loginPortal, status: "error", steps, startedAt, finishedAt: new Date().toISOString() };
    }

    await page.evaluate(() => {
      const kw = ["złóż wniosek", "kontynuuj", "edytuj wniosek"];
      const els = Array.from(document.querySelectorAll("button, a, td a, td button")).filter(
        b => !(b as Element).closest("nav") && !(b as Element).closest(".navbar") && !b.classList.contains("nav-link")
      );
      for (const k of kw) { for (const el of els) { if ((el.textContent || "").trim().toLowerCase().includes(k)) { (el as HTMLElement).click(); return; } } }
      for (const el of els) { const c = (el as Element).className || ""; if (c.includes("btn-primary") || c.includes("btn-success") || c.includes("btn-warning")) { (el as HTMLElement).click(); return; } }
    });

    await delay(1500);

    const pageText = await page.evaluate(() => document.body?.innerText?.substring(0, 2000) || "");
    if (pageText.toLowerCase().includes("złożono wniosek w projekcie")) {
      addStep(log("juz_zlozony", "ok", "Wniosek juz zlozony"));
      session.status = "done";
      return { participantId: participant.id, imie: participant.imie, nazwisko: participant.nazwisko,
        loginPortal: participant.loginPortal, status: "completed", steps, startedAt, finishedAt: new Date().toISOString() };
    }

    addStep(log("submit_klik", "ok", `Na formularzu. URL: ${page.url()}`));

    // ===== STEP 1: Two dropdowns + PDF + "Przejdz dalej" — FAST =====
    const s1Selects = await page.evaluate(() => {
      const sels = Array.from(document.querySelectorAll("select"));
      return sels.map((s, i) => {
        if (!s.id) s.id = `__q1_${i}_${Date.now()}`;
        return { id: s.id, opts: Array.from((s as HTMLSelectElement).options).filter(o => o.value && o.value !== "" && o.value !== "0").map(o => ({ value: o.value, text: o.text })) };
      });
    });
    for (let i = 0; i < s1Selects.length; i++) {
      const sel = s1Selects[i];
      if (sel.opts.length === 0) continue;
      const chosen = i === 0
        ? (sel.opts.find(o => o.text.toLowerCase().includes("nie prowadzę") || o.text.toLowerCase().includes("działalności")) || sel.opts[0])
        : (sel.opts.find(o => o.text.toLowerCase().includes("mieszkam")) || sel.opts[0]);
      await page.select(`#${sel.id}`, chosen.value).catch(() => {});
      await delay(200);
    }

    const u1 = await uploadAllFiles();
    addStep(log("step1", "ok", `Selecty+upload(${u1})`));

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, input[type='submit']"));
      for (const b of btns) { if ((b.textContent || "").toLowerCase().includes("dalej")) { (b as HTMLElement).click(); return; } }
    });
    await delay(2000);

    const onStep2 = await page.evaluate(() => document.querySelectorAll("select").length >= 3);
    if (!onStep2) {
      await delay(2000);
    }
    addStep(log("step1_dalej", "ok", `Przejdz dalej. URL: ${page.url()}`));

    // ===== STEP 2: Address + fields + uploads + selects + checkboxes — FAST =====
    const adresMatch = participant.adres.match(/^ul\.?\s*(.+?)\s+(\d+.*)$/i);
    const ulicaName = adresMatch ? adresMatch[1] : participant.adres.replace(/^ul\.?\s*/i, "");
    const numerDomuLokalu = adresMatch ? adresMatch[2] : "";

    // Cascading address selects — need Blazor reaction time between each
    const woj = await blazorSelectFast(0, "łódzkie", 1500);
    const powSearch = participant.miasto.toLowerCase() === "łódź" ? "łódź" : participant.miasto;
    let pow = { ok: false, msg: "" };
    for (let r = 0; r < 3; r++) { pow = await blazorSelectFast(1, powSearch, 1500); if (pow.ok) break; await delay(1000); }
    let gm = { ok: false, msg: "" };
    for (let r = 0; r < 3; r++) { gm = await blazorSelectFast(2, powSearch, 1500); if (gm.ok) break; await delay(1000); }
    let mc = { ok: false, msg: "" };
    for (let r = 0; r < 3; r++) { mc = await blazorSelectFast(3, powSearch, 1500); if (mc.ok) break; await delay(1000); }
    let ul = { ok: false, msg: "" };
    for (let r = 0; r < 3; r++) { ul = await blazorSelectFast(4, ulicaName, 500); if (ul.ok) break; await delay(1000); }
    addStep(log("adres", "ok", `woj:${woj.msg} pow:${pow.msg} gm:${gm.msg} mc:${mc.msg} ul:${ul.msg}`));

    // Text fields — fill ALL empty inputs fast
    await page.evaluate((nrDomu, kodPoczt) => {
      const inputs = Array.from(document.querySelectorAll("input[type='text']:not([readonly]):not([disabled])")) as HTMLInputElement[];
      for (const inp of inputs) {
        if (inp.value) continue;
        let parent = inp.parentElement;
        let labelText = "";
        for (let i = 0; i < 3 && parent; i++) {
          const l = parent.querySelector("label, strong, b");
          if (l) labelText += " " + (l.textContent || "");
          parent = parent.parentElement;
        }
        const ctx = `${inp.name} ${inp.id} ${inp.placeholder} ${labelText}`.toLowerCase();
        let val = "Brak";
        if (ctx.includes("numer dom") || ctx.includes("domu") || ctx.includes("lokalu") || ctx.includes("budyn")) val = nrDomu || "1";
        else if (ctx.includes("kod") || ctx.includes("poczt")) val = kodPoczt;
        inp.focus();
        inp.value = val;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        inp.dispatchEvent(new Event('blur', { bubbles: true }));
      }
      const textareas = Array.from(document.querySelectorAll("textarea:not([readonly]):not([disabled])")) as HTMLTextAreaElement[];
      for (const ta of textareas) {
        if (ta.value) continue;
        ta.focus(); ta.value = "Brak";
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        ta.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    }, numerDomuLokalu, participant.kodPocztowy);
    addStep(log("pola", "ok", "Wypelniono pola tekstowe"));

    // Upload PDF to ALL file inputs
    const u2 = await uploadAllFiles();
    addStep(log("uploads", "ok", `PDF x${u2}`));

    // Fill remaining empty selects (status, education, etc.)
    const selectsInfo = await page.evaluate((notatkiRaw) => {
      const selects = Array.from(document.querySelectorAll("select"));
      const toFill: { id: string; value: string; label: string }[] = [];
      const notatki = notatkiRaw.toLowerCase();
      for (let i = 0; i < selects.length; i++) {
        const s = selects[i] as HTMLSelectElement;
        if (s.value && s.value !== "" && s.value !== "0") continue;
        if (!s.id) s.id = `__q_st_${i}_${Date.now()}`;
        const parent = s.closest(".form-group, .mb-3, .col, div") || s.parentElement;
        const lbl = ((parent?.textContent || "") + " " + (s.previousElementSibling?.textContent || "")).toLowerCase().substring(0, 300);
        const opts = Array.from(s.options);
        let chosen: { value: string; text: string } | null = null;
        let fn = "";
        if (lbl.includes("rynku pracy") || lbl.includes("status wnioskodawcy")) {
          fn = "praca";
          if (notatki.includes("zatrudnion") || notatki.includes("urzędzie pracy") || notatki.includes("urzedzie pracy"))
            chosen = opts.find(o => o.text.toLowerCase().includes("zatrudnion")) || null;
          if (!chosen && (notatki.includes("bezrobotn") || notatki.includes("pup") || notatki.includes("urzędzie")))
            chosen = opts.find(o => o.text.toLowerCase().includes("bezrobotn")) || null;
          if (!chosen) chosen = opts.find(o => o.text.toLowerCase().includes("bezrobotn")) || null;
        } else if (lbl.includes("wykształcen") || lbl.includes("isced")) {
          fn = "edu";
          if (notatki.includes("brak formal")) chosen = opts.find(o => o.text.toLowerCase().includes("isced 0") || o.text.toLowerCase().includes("brak")) || null;
          else if (notatki.includes("zawodowe")) chosen = opts.find(o => o.text.toLowerCase().includes("zawodow")) || null;
          else if (notatki.includes("średnie niepełne")) chosen = opts.find(o => o.text.toLowerCase().includes("gimnazjaln")) || null;
          else if (notatki.includes("średnie")) chosen = opts.find(o => o.text.toLowerCase().includes("ponadgimnazjaln") || o.text.toLowerCase().includes("isced 3")) || null;
          if (!chosen) chosen = opts.find(o => o.text.toLowerCase().includes("isced 0") || o.text.toLowerCase().includes("brak")) || null;
        } else if (lbl.includes("niepełnospraw") || lbl.includes("mniejszoś") || lbl.includes("obcego") || lbl.includes("bezdomn") || lbl.includes("pomocy społ") || lbl.includes("wykluczeni")) {
          fn = "nie";
          chosen = opts.find(o => o.text.toLowerCase().trim() === "nie") || null;
        } else {
          fn = `o${i}`;
          const ne = opts.filter(o => o.value && o.value !== "" && o.value !== "0");
          if (ne.length > 0) chosen = ne[0];
        }
        if (chosen) toFill.push({ id: s.id, value: chosen.value, label: `${fn}=${chosen.text.substring(0, 30)}` });
      }
      return toFill;
    }, participant.notatki || "");

    for (const sf of selectsInfo) {
      await page.select(`#${sf.id}`, sf.value).catch(() => {
        page.evaluate((id, val) => {
          const el = document.getElementById(id) as HTMLSelectElement;
          if (el) { el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }
        }, sf.id, sf.value);
      });
      await page.evaluate((id) => {
        const el = document.getElementById(id) as HTMLSelectElement;
        if (el) { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
      }, sf.id);
    }
    addStep(log("selecty", "ok", `${selectsInfo.map(s => s.label).join("; ")}`));

    // Checkboxes — select specific ones
    await page.evaluate(() => {
      const cbs = Array.from(document.querySelectorAll("input[type='checkbox']")) as HTMLInputElement[];
      for (const cb of cbs) {
        if (cb.checked || cb.disabled) continue;
        const p = cb.closest(".form-group, .mb-3, div, label") || cb.parentElement;
        const t = (p?.textContent || "").toLowerCase();
        if (t.includes("nie potrzebuję") || t.includes("nie potrzebuje") || t.includes("dostępnościow") ||
            t.includes("doradztw") || t.includes("doradcy zawodowego") || t.includes("zainteresowany") ||
            t.includes("akceptuję") || t.includes("akceptuje") || t.includes("oświadczen") || t.includes("oswiadczen"))
          cb.click();
      }
    });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(300);

    // Final check: fill any remaining empty required fields
    await page.evaluate(() => {
      const emptyInputs = Array.from(document.querySelectorAll("input[type='text']:not([readonly]):not([disabled])")) as HTMLInputElement[];
      for (const inp of emptyInputs) {
        if (!inp.value) {
          inp.value = "Brak";
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      const emptySelects = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];
      for (const sel of emptySelects) {
        if (!sel.value || sel.value === "" || sel.value === "0") {
          const opts = Array.from(sel.options).filter(o => o.value && o.value !== "" && o.value !== "0");
          if (opts.length > 0) {
            sel.value = opts[0].value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }
    });

    screenshot = await takeScreenshot(page);
    addStep(log("gotowy", "ok", `Formularz gotowy. URL: ${page.url()}`, screenshot));

    if (autoSubmit) {
      const clicked = await page.evaluate(() => {
        const kw = ["złóż wniosek", "wyślij", "wyslij", "zapisz", "zatwierdź", "zatwierdz"];
        const btns = Array.from(document.querySelectorAll("button, input[type='submit']"));
        for (const b of btns) { const t = (b.textContent || "").trim().toLowerCase(); if (kw.some(k => t.includes(k))) { (b as HTMLElement).click(); return t; } }
        const primary = btns.find(b => (b as Element).className?.includes("btn-primary") || (b as Element).className?.includes("btn-success"));
        if (primary) { (primary as HTMLElement).click(); return (primary.textContent || "").trim(); }
        return "";
      });

      await delay(2000);
      screenshot = await takeScreenshot(page);

      if (clicked) {
        addStep(log("wyslano", "ok", `WYSLANO: "${clicked}". URL: ${page.url()}`, screenshot));
        status = "completed";
      } else {
        addStep(log("wyslano", "skip", `Nie znaleziono przycisku. URL: ${page.url()}`, screenshot));
        status = "stopped";
      }
    } else {
      screenshot = await takeScreenshot(page);
      addStep(log("stop", "stop", "Auto-submit off", screenshot));
      status = "stopped";
    }

    session.status = "done";
  } catch (err: any) {
    if (!steps.some(s => s.status === "error")) {
      steps.push(log("blad", "error", `Blad: ${err.message}`));
    }
    status = "error";
    session.status = "error";
    session.error = err.message;
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

export async function fstSubmitAll(
  participants: ParticipantData[],
  onProgress?: ProgressCallback,
  concurrency = 3,
  autoSubmit = true,
): Promise<AutomationResult[]> {
  const results: AutomationResult[] = new Array(participants.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < participants.length) {
      const idx = nextIndex++;
      const p = participants[idx];
      console.log(`[fst-submit] Starting ${p.imie} ${p.nazwisko} (${idx + 1}/${participants.length})`);
      try {
        results[idx] = await fstSubmitParticipant(p, onProgress, autoSubmit);
      } catch (err: any) {
        results[idx] = {
          participantId: p.id, imie: p.imie, nazwisko: p.nazwisko, loginPortal: p.loginPortal,
          status: "error",
          steps: [{ step: "blad_krytyczny", status: "error", message: `Blad: ${err.message}`, timestamp: new Date().toISOString() }],
          startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        };
      }
    }
  }

  const workerCount = Math.min(concurrency, participants.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function fstCleanupAll(): Promise<{ closed: number }> {
  let closed = 0;
  for (const [pid, session] of fstSessions) {
    try {
      await session.page.close();
      closed++;
    } catch {}
    fstSessions.delete(pid);
  }
  if (fstSharedBrowser) {
    try { await fstSharedBrowser.close(); } catch {}
    fstSharedBrowser = null;
  }
  return { closed };
}

export type PortalType = "ebon" | "fst";

export async function runAutomationForAll(
  participants: ParticipantData[],
  onProgress?: ProgressCallback,
  concurrency = 3,
  portal: PortalType = "ebon"
): Promise<AutomationResult[]> {
  const results: AutomationResult[] = new Array(participants.length);
  let nextIndex = 0;

  const automationFn = portal === "fst" ? runFstAutomationForParticipant : runAutomationForParticipant;

  async function worker() {
    while (nextIndex < participants.length) {
      const idx = nextIndex++;
      const p = participants[idx];
      console.log(`[automation][${portal}] Starting worker for ${p.imie} ${p.nazwisko} (${idx + 1}/${participants.length})`);
      try {
        results[idx] = await automationFn(p, onProgress);
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
  console.log(`[automation][${portal}] Launching ${workerCount} parallel workers for ${participants.length} participants`);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  return results;
}
