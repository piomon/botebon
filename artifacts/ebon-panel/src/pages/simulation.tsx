import { useState, useEffect } from "react";
import { useListParticipants, getListParticipantsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Play, ChevronRight, ChevronLeft, Globe, Lock, User, 
  CheckCircle2, ArrowRight, Monitor, RefreshCw, X, Minus, Square,
  FileText, ClipboardList, Send
} from "lucide-react";

interface Participant {
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

const SCREENS = [
  { id: "login", title: "Logowanie", url: "https://projektebon.pl/logowanie" },
  { id: "home", title: "Strona Glowna", url: "https://projektebon.pl/dashboard" },
  { id: "rekrutacja", title: "Rekrutacja", url: "https://projektebon.pl/rekrutacja" },
  { id: "nabor", title: "Rekrutacja NABOR 6", url: "https://projektebon.pl/rekrutacja/nabor-6" },
  { id: "formularz_dane", title: "Formularz - Dane osobowe", url: "https://projektebon.pl/rekrutacja/nabor-6/wniosek/dane-osobowe" },
  { id: "formularz_adres", title: "Formularz - Adres", url: "https://projektebon.pl/rekrutacja/nabor-6/wniosek/adres" },
  { id: "formularz_kontakt", title: "Formularz - Kontakt", url: "https://projektebon.pl/rekrutacja/nabor-6/wniosek/kontakt" },
  { id: "formularz_dokumenty", title: "Formularz - Dokumenty", url: "https://projektebon.pl/rekrutacja/nabor-6/wniosek/dokumenty" },
  { id: "formularz_oswiadczenia", title: "Formularz - Oswiadczenia", url: "https://projektebon.pl/rekrutacja/nabor-6/wniosek/oswiadczenia" },
  { id: "podglad", title: "Podglad wniosku", url: "https://projektebon.pl/rekrutacja/nabor-6/wniosek/podglad" },
  { id: "stop", title: "STOP - Reczne wyslanie", url: "https://projektebon.pl/rekrutacja/nabor-6/wniosek/wyslij" },
];

function BrowserChrome({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg overflow-hidden shadow-lg bg-white flex flex-col" style={{ minHeight: "520px" }}>
      <div className="bg-[#dee1e6] px-2 pt-2 pb-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex gap-1.5 pl-1">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]"></div>
            <div className="w-3 h-3 rounded-full bg-[#febc2e]"></div>
            <div className="w-3 h-3 rounded-full bg-[#28c840]"></div>
          </div>
          <div className="flex-1" />
          <Minus className="h-3 w-3 text-gray-500" />
          <Square className="h-3 w-3 text-gray-500" />
          <X className="h-3 w-3 text-gray-500" />
        </div>
        <div className="flex items-center gap-2 bg-white rounded-t-lg px-3 py-1.5 text-xs border-t border-x border-gray-200 max-w-[260px]">
          <Globe className="h-3 w-3 text-gray-400 shrink-0" />
          <span className="truncate text-gray-600">projektebon.pl</span>
        </div>
      </div>
      <div className="bg-[#f1f3f4] px-3 py-2 flex items-center gap-2 border-b">
        <ChevronLeft className="h-4 w-4 text-gray-400" />
        <ChevronRight className="h-4 w-4 text-gray-400" />
        <RefreshCw className="h-3.5 w-3.5 text-gray-400" />
        <div className="flex-1 bg-white rounded-full px-3 py-1 text-xs text-gray-600 border flex items-center gap-1.5">
          <Lock className="h-3 w-3 text-green-600 shrink-0" />
          <span className="truncate">{url}</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
}

function PortalHeader() {
  return (
    <div className="bg-[#1a365d] text-white px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-white/20 rounded flex items-center justify-center text-sm font-bold">EP</div>
        <span className="font-semibold text-sm">Projekt EBON - Portal Rekrutacyjny</span>
      </div>
      <div className="flex items-center gap-4 text-xs text-white/70">
        <span>Pomoc</span>
        <span>Kontakt</span>
      </div>
    </div>
  );
}

function PortalNav({ active }: { active?: string }) {
  const items = ["Pulpit", "Rekrutacja", "Moje wnioski", "Wiadomosci", "Profil"];
  return (
    <div className="bg-[#2a4a7f] px-6 flex gap-1">
      {items.map(item => (
        <div key={item} className={`px-4 py-2 text-xs font-medium cursor-pointer rounded-t ${
          active === item ? 'bg-white text-[#1a365d]' : 'text-white/80 hover:text-white hover:bg-white/10'
        }`}>{item}</div>
      ))}
    </div>
  );
}

function InputField({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      <div className={`border rounded px-3 py-1.5 text-sm ${
        highlight ? 'bg-green-50 border-green-400 text-green-900 ring-2 ring-green-200' : 'bg-gray-50 border-gray-300 text-gray-900'
      }`}>
        {value || <span className="text-gray-300">—</span>}
      </div>
    </div>
  );
}

function ScreenLogin({ p, filled }: { p: Participant; filled: boolean }) {
  return (
    <div className="min-h-[400px] bg-gradient-to-b from-[#f0f4f8] to-white flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-8 w-[380px] border">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-[#1a365d] rounded-full mx-auto mb-3 flex items-center justify-center">
            <User className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-lg font-bold text-gray-800">Zaloguj sie do portalu</h2>
          <p className="text-xs text-gray-500 mt-1">projektebon.pl</p>
        </div>
        <div className="space-y-4">
          <InputField label="Login / Email" value={filled ? p.loginPortal : ""} highlight={filled} />
          <InputField label="Haslo" value={filled ? p.haslo : ""} highlight={filled} />
          <button className={`w-full py-2 rounded text-sm font-medium text-white ${
            filled ? 'bg-green-600 hover:bg-green-700' : 'bg-[#1a365d] hover:bg-[#2a4a7f]'
          }`}>
            {filled ? "Zalogowano pomyslnie" : "Zaloguj sie"}
          </button>
        </div>
        {filled && (
          <div className="mt-3 text-center text-xs text-green-600 flex items-center justify-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Dane logowania uzupelnione automatycznie
          </div>
        )}
      </div>
    </div>
  );
}

function ScreenHome({ p }: { p: Participant }) {
  return (
    <div>
      <PortalHeader />
      <PortalNav active="Pulpit" />
      <div className="p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Witaj, {p.imie} {p.nazwisko}!</h2>
        <p className="text-sm text-gray-500 mb-6">Twoje konto jest aktywne. Przejdz do sekcji Rekrutacja, aby zlozyc wniosek.</p>
        <div className="grid grid-cols-3 gap-4">
          <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
            <ClipboardList className="h-6 w-6 text-blue-600 mb-2" />
            <div className="text-sm font-medium text-blue-900">Rekrutacja</div>
            <div className="text-xs text-blue-600 mt-1">Dostepne nabory: 1</div>
          </div>
          <div className="border rounded-lg p-4 bg-gray-50">
            <FileText className="h-6 w-6 text-gray-400 mb-2" />
            <div className="text-sm font-medium text-gray-600">Moje wnioski</div>
            <div className="text-xs text-gray-400 mt-1">Brak zlozonych</div>
          </div>
          <div className="border rounded-lg p-4 bg-gray-50">
            <Send className="h-6 w-6 text-gray-400 mb-2" />
            <div className="text-sm font-medium text-gray-600">Wiadomosci</div>
            <div className="text-xs text-gray-400 mt-1">0 nowych</div>
          </div>
        </div>
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
          Aby przejsc do skladania wniosku, kliknij zakladke <strong>Rekrutacja</strong> w menu nawigacyjnym.
        </div>
      </div>
    </div>
  );
}

function ScreenRekrutacja() {
  return (
    <div>
      <PortalHeader />
      <PortalNav active="Rekrutacja" />
      <div className="p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Rekrutacja</h2>
        <p className="text-sm text-gray-500 mb-4">Dostepne nabory rekrutacyjne:</p>
        <div className="space-y-3">
          <div className="border rounded-lg p-4 bg-gray-50 opacity-50">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm font-medium text-gray-600">Rekrutacja NABOR 4</div>
                <div className="text-xs text-gray-400 mt-1">Zakonczony: 2025-12-31</div>
              </div>
              <span className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded">Zamkniety</span>
            </div>
          </div>
          <div className="border rounded-lg p-4 bg-gray-50 opacity-50">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm font-medium text-gray-600">Rekrutacja NABOR 5</div>
                <div className="text-xs text-gray-400 mt-1">Zakonczony: 2026-02-28</div>
              </div>
              <span className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded">Zamkniety</span>
            </div>
          </div>
          <div className="border-2 border-green-400 rounded-lg p-4 bg-green-50 ring-2 ring-green-200">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm font-bold text-green-900">Rekrutacja NABOR 6</div>
                <div className="text-xs text-green-600 mt-1">Aktywny od: 2026-04-01 do: 2026-06-30</div>
              </div>
              <span className="text-xs px-2 py-1 bg-green-600 text-white rounded font-medium">Aktywny</span>
            </div>
            <div className="mt-2 text-xs text-green-700">Kliknij aby przejsc do formularza aplikacyjnego</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScreenNabor() {
  return (
    <div>
      <PortalHeader />
      <PortalNav active="Rekrutacja" />
      <div className="p-6">
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
          <span>Rekrutacja</span> <ChevronRight className="h-3 w-3" /> <span className="text-gray-700 font-medium">NABOR 6</span>
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Rekrutacja NABOR 6</h2>
        <p className="text-sm text-gray-500 mb-4">Projekt EBON - nabor uczestnikow projektu szkoleniowego</p>
        <div className="border rounded-lg p-5 bg-gray-50 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Informacje o naborze</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><span className="text-gray-400">Okres naboru:</span> <span className="font-medium">01.04.2026 — 30.06.2026</span></div>
            <div><span className="text-gray-400">Liczba miejsc:</span> <span className="font-medium">120</span></div>
            <div><span className="text-gray-400">Region:</span> <span className="font-medium">wojewodztwo lodzkie</span></div>
            <div><span className="text-gray-400">Pozostalo miejsc:</span> <span className="font-medium text-green-600">87</span></div>
          </div>
        </div>
        <button className="w-full bg-[#1a365d] text-white py-2.5 rounded text-sm font-medium hover:bg-[#2a4a7f] flex items-center justify-center gap-2">
          <FileText className="h-4 w-4" /> Zloz wniosek rekrutacyjny
        </button>
      </div>
    </div>
  );
}

function ScreenFormDane({ p, filled }: { p: Participant; filled: boolean }) {
  return (
    <div>
      <PortalHeader />
      <PortalNav active="Rekrutacja" />
      <div className="p-6">
        <FormBreadcrumb step="Dane osobowe" stepNum={1} />
        <h2 className="text-base font-semibold text-gray-800 mb-4">Dane osobowe uczestnika</h2>
        <div className="grid grid-cols-2 gap-4">
          <InputField label="Imie" value={filled ? p.imie : ""} highlight={filled} />
          <InputField label="Nazwisko" value={filled ? p.nazwisko : ""} highlight={filled} />
          <InputField label="PESEL" value={filled ? p.pesel : ""} highlight={filled} />
          <InputField label="Data urodzenia" value={filled ? peselToDate(p.pesel) : ""} highlight={filled} />
        </div>
        {filled && <AutoFillBadge />}
      </div>
    </div>
  );
}

function ScreenFormAdres({ p, filled }: { p: Participant; filled: boolean }) {
  return (
    <div>
      <PortalHeader />
      <PortalNav active="Rekrutacja" />
      <div className="p-6">
        <FormBreadcrumb step="Adres" stepNum={2} />
        <h2 className="text-base font-semibold text-gray-800 mb-4">Adres zamieszkania</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <InputField label="Ulica i numer" value={filled ? p.adres : ""} highlight={filled} />
          </div>
          <InputField label="Kod pocztowy" value={filled ? p.kodPocztowy : ""} highlight={filled} />
          <InputField label="Miasto" value={filled ? p.miasto : ""} highlight={filled} />
          <InputField label="Wojewodztwo" value={filled ? "lodzkie" : ""} highlight={filled} />
          <InputField label="Kraj" value={filled ? "Polska" : ""} highlight={filled} />
        </div>
        {filled && <AutoFillBadge />}
      </div>
    </div>
  );
}

function ScreenFormKontakt({ p, filled }: { p: Participant; filled: boolean }) {
  return (
    <div>
      <PortalHeader />
      <PortalNav active="Rekrutacja" />
      <div className="p-6">
        <FormBreadcrumb step="Kontakt" stepNum={3} />
        <h2 className="text-base font-semibold text-gray-800 mb-4">Dane kontaktowe</h2>
        <div className="grid grid-cols-2 gap-4">
          <InputField label="Adres e-mail" value={filled ? p.email : ""} highlight={filled} />
          <InputField label="Numer telefonu" value={filled ? p.telefon : ""} highlight={filled} />
          <InputField label="Telefon dodatkowy" value="" />
        </div>
        {filled && <AutoFillBadge />}
      </div>
    </div>
  );
}

function ScreenFormDokumenty({ filled }: { filled: boolean }) {
  return (
    <div>
      <PortalHeader />
      <PortalNav active="Rekrutacja" />
      <div className="p-6">
        <FormBreadcrumb step="Dokumenty" stepNum={4} />
        <h2 className="text-base font-semibold text-gray-800 mb-4">Zalaczniki i dokumenty</h2>
        <div className="space-y-3">
          <div className="border rounded p-3 bg-gray-50 flex items-center justify-between">
            <div className="text-sm">Zaswiadczenie z UP / oswiadczenie o statusie</div>
            <span className={`text-xs px-2 py-0.5 rounded ${filled ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {filled ? "Zaznaczono" : "Wymagane"}
            </span>
          </div>
          <div className="border rounded p-3 bg-gray-50 flex items-center justify-between">
            <div className="text-sm">Kopia dokumentu tozsamosci</div>
            <span className={`text-xs px-2 py-0.5 rounded ${filled ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {filled ? "Zaznaczono" : "Wymagane"}
            </span>
          </div>
          <div className="border rounded p-3 bg-gray-50 flex items-center justify-between">
            <div className="text-sm">Zaswiadczenie o wyksztalceniu</div>
            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">Opcjonalne</span>
          </div>
        </div>
        {filled && <AutoFillBadge text="Wymagane dokumenty oznaczone automatycznie" />}
      </div>
    </div>
  );
}

function ScreenFormOswiadczenia({ filled }: { filled: boolean }) {
  return (
    <div>
      <PortalHeader />
      <PortalNav active="Rekrutacja" />
      <div className="p-6">
        <FormBreadcrumb step="Oswiadczenia" stepNum={5} />
        <h2 className="text-base font-semibold text-gray-800 mb-4">Oswiadczenia uczestnika</h2>
        <div className="space-y-3">
          {[
            "Oswiadczam, ze zapoznalem/am sie z regulaminem projektu.",
            "Wyrazam zgode na przetwarzanie danych osobowych.",
            "Potwierdzam prawdziwosc podanych danych.",
            "Oswiadczam, ze spelniamy kryteria grupy docelowej projektu.",
          ].map((text, i) => (
            <label key={i} className="flex items-start gap-3 border rounded p-3 bg-gray-50 cursor-pointer">
              <div className={`mt-0.5 w-4 h-4 border-2 rounded flex items-center justify-center shrink-0 ${
                filled ? 'bg-green-600 border-green-600' : 'border-gray-300'
              }`}>
                {filled && <CheckCircle2 className="h-3 w-3 text-white" />}
              </div>
              <span className="text-sm text-gray-700">{text}</span>
            </label>
          ))}
        </div>
        {filled && <AutoFillBadge text="Wszystkie oswiadczenia zaakceptowane automatycznie" />}
      </div>
    </div>
  );
}

function ScreenPodglad({ p }: { p: Participant }) {
  return (
    <div>
      <PortalHeader />
      <PortalNav active="Rekrutacja" />
      <div className="p-6">
        <FormBreadcrumb step="Podglad wniosku" stepNum={6} />
        <h2 className="text-base font-semibold text-gray-800 mb-4">Podglad wniosku przed wyslaniem</h2>
        <div className="border rounded-lg divide-y text-sm">
          <div className="p-3 bg-gray-50 font-semibold text-gray-700">Dane osobowe</div>
          <div className="p-3 grid grid-cols-2 gap-2">
            <div><span className="text-gray-400 text-xs">Imie:</span> {p.imie}</div>
            <div><span className="text-gray-400 text-xs">Nazwisko:</span> {p.nazwisko}</div>
            <div><span className="text-gray-400 text-xs">PESEL:</span> {p.pesel}</div>
            <div><span className="text-gray-400 text-xs">Data ur.:</span> {peselToDate(p.pesel)}</div>
          </div>
          <div className="p-3 bg-gray-50 font-semibold text-gray-700">Adres</div>
          <div className="p-3 grid grid-cols-2 gap-2">
            <div className="col-span-2"><span className="text-gray-400 text-xs">Adres:</span> {p.adres}</div>
            <div><span className="text-gray-400 text-xs">Kod pocztowy:</span> {p.kodPocztowy}</div>
            <div><span className="text-gray-400 text-xs">Miasto:</span> {p.miasto}</div>
          </div>
          <div className="p-3 bg-gray-50 font-semibold text-gray-700">Kontakt</div>
          <div className="p-3 grid grid-cols-2 gap-2">
            <div><span className="text-gray-400 text-xs">Email:</span> {p.email}</div>
            <div><span className="text-gray-400 text-xs">Telefon:</span> {p.telefon}</div>
          </div>
          <div className="p-3 bg-gray-50 font-semibold text-gray-700">Dokumenty i oswiadczenia</div>
          <div className="p-3 flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-4 w-4" /> Komplet dokumentow i oswiadczen
          </div>
        </div>
      </div>
    </div>
  );
}

function ScreenStop() {
  return (
    <div>
      <PortalHeader />
      <PortalNav active="Rekrutacja" />
      <div className="p-6">
        <div className="border-2 border-red-400 rounded-lg p-6 bg-red-50 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full mx-auto mb-4 flex items-center justify-center">
            <X className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-lg font-bold text-red-900 mb-2">STOP — Symulacja zatrzymana</h2>
          <p className="text-sm text-red-700 mb-4">
            Wniosek jest gotowy do wyslania, ale wymaga <strong>recznego potwierdzenia</strong> przez koordynatora.
          </p>
          <p className="text-xs text-red-600 mb-4">
            Automatyczne wysylanie jest wylaczone ze wzgledow bezpieczenstwa.<br/>
            Aby wyslac wniosek, zaloguj sie recznie na portal i kliknij przycisk "Wyslij wniosek".
          </p>
          <div className="flex justify-center gap-3">
            <button className="px-4 py-2 bg-gray-300 text-gray-600 rounded text-sm cursor-not-allowed" disabled>
              Wyslij wniosek (zablokowane)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormBreadcrumb({ step, stepNum }: { step: string; stepNum: number }) {
  const allSteps = ["Dane osobowe", "Adres", "Kontakt", "Dokumenty", "Oswiadczenia", "Podglad wniosku"];
  return (
    <div className="flex items-center gap-1 text-xs text-gray-400 mb-4 overflow-x-auto">
      <span>Nabor 6</span>
      <ChevronRight className="h-3 w-3 shrink-0" />
      <span>Wniosek</span>
      <ChevronRight className="h-3 w-3 shrink-0" />
      <span className="text-gray-700 font-medium">{step}</span>
      <span className="ml-auto text-gray-400 shrink-0">Krok {stepNum} z {allSteps.length}</span>
    </div>
  );
}

function AutoFillBadge({ text }: { text?: string }) {
  return (
    <div className="mt-4 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700 flex items-center gap-2">
      <CheckCircle2 className="h-3 w-3 shrink-0" />
      {text || "Pola uzupelnione automatycznie z danych uczestnika"}
    </div>
  );
}

function peselToDate(pesel: string): string {
  if (!pesel || pesel.length < 6) return "";
  const yr = parseInt(pesel.substring(0, 2), 10);
  let mo = parseInt(pesel.substring(2, 4), 10);
  const day = parseInt(pesel.substring(4, 6), 10);
  let century = 1900;
  if (mo > 80) { century = 1800; mo -= 80; }
  else if (mo > 60) { century = 2200; mo -= 60; }
  else if (mo > 40) { century = 2100; mo -= 40; }
  else if (mo > 20) { century = 2000; mo -= 20; }
  const year = century + yr;
  return `${String(day).padStart(2, "0")}.${String(mo).padStart(2, "0")}.${year}`;
}

export default function Simulation() {
  const { data: participants, isLoading } = useListParticipants({
    query: { queryKey: getListParticipantsQueryKey() }
  });

  const [selectedParticipantId, setSelectedParticipantId] = useState<string>("");
  const [currentStep, setCurrentStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);

  const participant = participants?.find((p: any) => String(p.id) === selectedParticipantId) as Participant | undefined;
  const screen = SCREENS[currentStep];

  useEffect(() => {
    if (!autoPlay || !isRunning) return;
    if (currentStep >= SCREENS.length - 1) {
      setAutoPlay(false);
      return;
    }
    const timer = setTimeout(() => setCurrentStep(s => s + 1), 2000);
    return () => clearTimeout(timer);
  }, [autoPlay, currentStep, isRunning]);

  const startSimulation = () => {
    if (!participant) return;
    setCurrentStep(0);
    setIsRunning(true);
    setAutoPlay(false);
  };

  const renderScreen = () => {
    if (!participant) return null;
    switch (screen.id) {
      case "login": return <ScreenLogin p={participant} filled={true} />;
      case "home": return <ScreenHome p={participant} />;
      case "rekrutacja": return <ScreenRekrutacja />;
      case "nabor": return <ScreenNabor />;
      case "formularz_dane": return <ScreenFormDane p={participant} filled={true} />;
      case "formularz_adres": return <ScreenFormAdres p={participant} filled={true} />;
      case "formularz_kontakt": return <ScreenFormKontakt p={participant} filled={true} />;
      case "formularz_dokumenty": return <ScreenFormDokumenty filled={true} />;
      case "formularz_oswiadczenia": return <ScreenFormOswiadczenia filled={true} />;
      case "podglad": return <ScreenPodglad p={participant} />;
      case "stop": return <ScreenStop />;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Symulacja Portalu</h1>
        <p className="text-muted-foreground">Interaktywny podglad procesu logowania i skladania wniosku na projektebon.pl</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[250px]">
              <label className="text-sm font-medium mb-2 block">Wybierz uczestnika</label>
              <Select value={selectedParticipantId} onValueChange={v => { setSelectedParticipantId(v); setIsRunning(false); setCurrentStep(0); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz uczestnika..." />
                </SelectTrigger>
                <SelectContent>
                  {isLoading ? (
                    <SelectItem value="loading" disabled>Ladowanie...</SelectItem>
                  ) : (
                    participants?.map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.imie} {p.nazwisko} — {p.loginPortal}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={startSimulation} disabled={!participant}>
              <Play className="mr-2 h-4 w-4" /> Rozpocznij symulacje
            </Button>
            {isRunning && (
              <Button variant="outline" onClick={() => setAutoPlay(!autoPlay)}>
                {autoPlay ? "Zatrzymaj auto" : "Auto-odtwarzanie"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isRunning && participant && (
        <>
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {SCREENS.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => setCurrentStep(idx)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs whitespace-nowrap transition-colors ${
                  idx === currentStep
                    ? 'bg-primary text-primary-foreground font-medium'
                    : idx < currentStep
                    ? 'bg-green-100 text-green-800'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {idx < currentStep && <CheckCircle2 className="h-3 w-3" />}
                <span>{idx + 1}. {s.title}</span>
              </button>
            ))}
          </div>

          <BrowserChrome url={screen.url}>
            {renderScreen()}
          </BrowserChrome>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setCurrentStep(s => s - 1)} disabled={currentStep === 0}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Poprzedni krok
            </Button>
            <div className="text-sm text-muted-foreground">
              Krok {currentStep + 1} z {SCREENS.length}: <strong>{screen.title}</strong>
            </div>
            <Button onClick={() => setCurrentStep(s => s + 1)} disabled={currentStep >= SCREENS.length - 1}>
              Nastepny krok <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
