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
