import { 
  useGetDashboardSummary, 
  getGetDashboardSummaryQueryKey,
  useListOperationHistory,
  getListOperationHistoryQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, CheckCircle, AlertTriangle, Calendar, Activity, Clock, BookOpen, ChevronDown, ChevronRight, Download, FileText } from "lucide-react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { useState, useRef } from "react";

interface InstructionSection {
  title: string;
  content: string[];
}

const instructionSections: InstructionSection[] = [
  {
    title: "1. Logowanie do panelu",
    content: [
      "Aby korzystac z EBON Panel, musisz sie najpierw zalogowac.",
      "Na ekranie logowania wpisz swoj adres email administratora oraz haslo.",
      "Po poprawnym zalogowaniu zostaniesz przeniesiona na strone glowna — Pulpit Operacyjny.",
      "Sesja logowania jest zapamietywana w przegladarce. Jesli zamkniesz karte lub przegladarke, musisz zalogowac sie ponownie.",
      "Aby sie wylogowac, kliknij przycisk 'Wyloguj' w gornym menu."
    ]
  },
  {
    title: "2. Pulpit Operacyjny (strona glowna)",
    content: [
      "Pulpit to Twoja strona startowa po zalogowaniu.",
      "Widoczne sa tu 4 kafelki z najwazniejszymi informacjami:",
      "  • Uczestnicy — laczna liczba osob zarejestrowanych w systemie",
      "  • Gotowi do wysylki — ile osob przeszlo pozytywna walidacje danych",
      "  • Bledy walidacji — ile osob ma bledy w danych (np. zly PESEL, brak emaila)",
      "  • Status Harmonogramu — czy plan wysylki jest skonfigurowany",
      "Ponizej kafelkow znajduje sie lista ostatnich operacji (walidacja, planowanie, automatyzacja).",
      "Po prawej stronie sa Szybkie akcje — kliknij dowolna, aby przejsc do odpowiedniej sekcji."
    ]
  },
  {
    title: "3. Uczestnicy — zarzadzanie danymi",
    content: [
      "Przejdz do zakladki 'Uczestnicy' w menu bocznym.",
      "Zobaczysz tabele ze wszystkimi 8 uczestnikami rekrutacji.",
      "Kazdy wiersz zawiera: imie, nazwisko, PESEL, email, telefon, login portalowy.",
      "Kliknij na wiersz uczestnika, aby rozwinac szczegoly — zobaczysz pelny adres, haslo portalu i wszystkie dane.",
      "Przycisk z ikonka oka (👁) przy hasle pozwala pokazac/ukryc haslo.",
      "Ikony kopiowania przy loginie i hasle pozwalaja jednym kliknieciem skopiowac dane do schowka.",
      "Mozesz edytowac dane uczestnika — kliknij przycisk edycji, zmien dane i zapisz.",
      "Mozesz tez dodac nowego uczestnika lub usunac istniejacego.",
      "UWAGA: Dane sa wrazliwe (PESEL, adresy, hasla). Nie udostepniaj nikomu dostepu do tego panelu."
    ]
  },
  {
    title: "4. Walidacja danych",
    content: [
      "Przejdz do zakladki 'Walidacja' w menu bocznym.",
      "Kliknij przycisk 'Uruchom walidacje' — system sprawdzi poprawnosc danych wszystkich uczestnikow.",
      "Sprawdzane sa nastepujace elementy:",
      "  • PESEL — poprawnosc sumy kontrolnej (czy numer jest prawidlowy)",
      "  • Adres email — czy ma poprawny format (np. @gmail.com)",
      "  • Numer telefonu — czy ma 9 cyfr",
      "  • Login portalowy — czy jest uzupelniony",
      "  • Haslo portalowe — czy jest uzupelnione",
      "Po zakonczeniu walidacji zobaczysz liste wynikow — kazdy uczestnik bedzie oznaczony jako OK (zielony) lub z bledami (czerwony).",
      "Jesli sa bledy — przejdz do zakladki Uczestnicy i popraw dane, a nastepnie uruchom walidacje ponownie."
    ]
  },
  {
    title: "5. Plan dzialania",
    content: [
      "Przejdz do zakladki 'Plan' w menu bocznym.",
      "Tutaj mozesz wygenerowac harmonogram wysylki wnioskow.",
      "System zaplanuje kolejnosc wysylania wnioskow z odpowiednimi odstepami czasowymi.",
      "Plan uwzglednia date otwarcia NABORU 9 (10 kwietnia 2026, godz. 16:00).",
      "Mozesz ustalic, ile sekund ma byc przerwy miedzy kolejnymi wysylkami.",
      "Po wygenerowaniu planu zobaczysz szczegolowy harmonogram — kto, o ktorej godzinie."
    ]
  },
  {
    title: "6. Automatyzacja — wysylanie wnioskow",
    content: [
      "To najwazniejsza funkcja panelu! Przejdz do zakladki 'Automatyzacja' w menu bocznym.",
      "",
      "CO ROBI AUTOMATYZACJA:",
      "System otwiera prawdziwa przegladarke internetowa i wykonuje nastepujace kroki:",
      "  1. Otwiera strone https://projektebon.pl",
      "  2. Akceptuje ciasteczka (cookies)",
      "  3. Klika przycisk 'Aplikacja EBON'",
      "  4. Wpisuje login i haslo uczestnika",
      "  5. Loguje sie na portal",
      "  6. Przechodzi do sekcji Rekrutacja",
      "  7. Szuka NABOR 9 i otwiera formularz",
      "  8. Wypelnia formularz danymi uczestnika",
      "  9. Automatycznie klika przycisk wyslania i wysyla wniosek",
      "",
      "Na kazdym etapie system robi zrzut ekranu, ktory mozesz przejrzec.",
      "",
      "JAK URUCHOMIC:",
      "  • Kliknij 'Uruchom dla jednego uczestnika' — wybierz osobe z listy i uruchom",
      "  • Kliknij 'Uruchom dla wszystkich' — system wysle wnioski kolejno dla kazdej osoby",
      "",
      "ODLICZANIE DO NABORU:",
      "Na gorze strony widoczny jest zegar odliczajacy czas do otwarcia NABORU 9.",
      "  • NABOR 9 otwiera sie: 10 kwietnia 2026, godzina 16:00",
      "  • NABOR 9 zamyka sie: 16 kwietnia 2026, godzina 17:00",
      "Mozesz uruchomic automatyzacje w dowolnym momencie, ale wniosek zostanie przyjety tylko w czasie trwania naboru.",
      "",
      "WAZNE INFORMACJE:",
      "  • Konta uczestnikow na portalu musza miec potwierdzony adres email (weryfikacja mailowa)",
      "  • Jesli konto nie jest zweryfikowane, automatyzacja zatrzyma sie na etapie weryfikacji",
      "  • Kazda operacja jest rejestrowana w historii — mozesz sprawdzic statusy na Pulpicie",
      "  • Zrzuty ekranu pozwalaja zobaczyc dokladnie, co system robil na kazdym kroku"
    ]
  },
  {
    title: "7. Ustawienia",
    content: [
      "Przejdz do zakladki 'Ustawienia' w menu bocznym.",
      "Tutaj mozesz skonfigurowac ustawienia harmonogramu i dane portalu.",
      "Mozesz zmienic date i godzine planowanego uruchomienia automatyzacji.",
      "Ustawienia sa zapisywane i wykorzystywane przez modul planowania."
    ]
  },
  {
    title: "8. Najczesciej zadawane pytania (FAQ)",
    content: [
      "P: Co jesli automatyzacja sie zatrzyma w trakcie?",
      "O: Kazdy krok jest zapisywany ze zrzutem ekranu. Sprawdz, na ktorym etapie nastapil blad, popraw dane uczestnika i uruchom ponownie.",
      "",
      "P: Czy moge uruchomic automatyzacje wiele razy dla jednej osoby?",
      "O: Tak, mozesz uruchamiac dowolna ilosc razy. System za kazdym razem przechodzi caly proces od poczatku.",
      "",
      "P: Co jesli NABOR nie jest jeszcze otwarty?",
      "O: Automatyzacja przejdzie przez logowanie i nawigacje, ale formularz zgloszeniowy moze nie byc dostepny. System zrobi zrzut ekranu aktualnego stanu.",
      "",
      "P: Czy dane sa bezpieczne?",
      "O: Tak, dane sa przechowywane w zabezpieczonej bazie danych. Dostep do panelu wymaga logowania. Nie udostepniaj nikomu danych logowania do panelu.",
      "",
      "P: Co oznacza status 'skip' w logu automatyzacji?",
      "O: Oznacza, ze dany krok zostal pominiety (np. nie znaleziono przycisku lub formularza). Sprawdz zrzut ekranu, aby zobaczyc przyczyne.",
      "",
      "P: Jak potwierdzic emaile uczestnikow na portalu?",
      "O: Kazdy uczestnik musi zalogowac sie recznie na https://projektebon.pl, sprawdzic skrzynke pocztowa i kliknac link weryfikacyjny. To jednorazowa operacja."
    ]
  },
  {
    title: "9. Kolejnosc krokow — co robic krok po kroku",
    content: [
      "Oto zalecana kolejnosc dzialania przed naborem:",
      "",
      "KROK 1: Sprawdz dane uczestnikow",
      "  → Przejdz do 'Uczestnicy' i upewnij sie, ze wszystkie dane sa poprawne",
      "",
      "KROK 2: Uruchom walidacje",
      "  → Przejdz do 'Walidacja' i kliknij 'Uruchom walidacje'",
      "  → Popraw ewentualne bledy w danych",
      "",
      "KROK 3: Zweryfikuj emaile na portalu",
      "  → Upewnij sie, ze kazdy uczestnik ma potwierdzony email na projektebon.pl",
      "  → Jesli nie — zaloguj sie recznie na konto i potwierdz email",
      "",
      "KROK 4: Przetestuj automatyzacje",
      "  → Uruchom automatyzacje dla jednego uczestnika, aby sprawdzic, czy wszystko dziala",
      "  → Przejrzyj zrzuty ekranu",
      "",
      "KROK 5: Poczekaj na otwarcie NABORU 9",
      "  → Data otwarcia: 10 kwietnia 2026, godzina 16:00",
      "  → Zegar odliczajacy jest widoczny na stronie Automatyzacja",
      "",
      "KROK 6: Uruchom automatyzacje dla wszystkich",
      "  → Po otwarciu naboru kliknij 'Uruchom dla wszystkich'",
      "  → System wysle wnioski kolejno dla kazdego uczestnika",
      "  → Sledz postep i zrzuty ekranu na biezaco",
      "",
      "KROK 7: Sprawdz wyniki",
      "  → Po zakonczeniu przejrzyj statusy na Pulpicie",
      "  → Sprawdz, czy wszystkie wnioski zostaly wyslane pomyslnie"
    ]
  }
];

function InstructionPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const printRef = useRef<HTMLDivElement>(null);

  const toggleSection = (index: number) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedSections(new Set(instructionSections.map((_, i) => i)));
  };

  const collapseAll = () => {
    setExpandedSections(new Set());
  };

  const handleDownloadPDF = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const content = instructionSections.map(section => {
      const lines = section.content.map(line => {
        if (line === "") return "<br/>";
        if (line.startsWith("  •") || line.startsWith("  →")) {
          return `<p style="margin:2px 0 2px 30px;font-size:13px;">${line}</p>`;
        }
        if (line.match(/^(KROK \d|CO ROBI|JAK URUCHOMIC|ODLICZANIE|WAZNE|P:|O:)/)) {
          return `<p style="margin:6px 0 2px 0;font-size:13px;font-weight:600;">${line}</p>`;
        }
        return `<p style="margin:2px 0;font-size:13px;">${line}</p>`;
      }).join("");
      return `<div style="margin-bottom:20px;"><h2 style="font-size:16px;font-weight:700;margin-bottom:8px;color:#1e3a5f;border-bottom:1px solid #ccc;padding-bottom:4px;">${section.title}</h2>${lines}</div>`;
    }).join("");

    printWindow.document.write(`<!DOCTYPE html><html><head><title>EBON Panel — Instrukcja obslugi</title><style>
      @media print { body { margin: 20mm; } }
      body { font-family: 'Segoe UI', Arial, sans-serif; color: #222; max-width: 800px; margin: 0 auto; padding: 30px; }
      h1 { text-align: center; color: #0f2b46; margin-bottom: 5px; }
      .subtitle { text-align: center; color: #666; margin-bottom: 30px; font-size: 14px; }
      .print-btn { display: block; margin: 0 auto 30px; padding: 12px 40px; font-size: 16px; background: #1e3a5f; color: white; border: none; border-radius: 8px; cursor: pointer; }
      .print-btn:hover { background: #2a4f7a; }
      @media print { .print-btn { display: none; } }
    </style></head><body>
      <h1>EBON Panel — Instrukcja obslugi</h1>
      <p class="subtitle">Panel koordynatora rekrutacji NABOR 9 | projektebon.pl</p>
      <button class="print-btn" onclick="window.print()">Drukuj / Zapisz jako PDF</button>
      ${content}
      <hr style="margin-top:30px;"/>
      <p style="text-align:center;color:#999;font-size:11px;">Wygenerowano: ${new Date().toLocaleDateString('pl-PL')} | EBON Panel v1.0</p>
    </body></html>`);
    printWindow.document.close();
  };

  return (
    <Card className="border-blue-500/30 bg-blue-950/20">
      <CardHeader 
        className="cursor-pointer select-none" 
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-500/20 p-2 rounded-lg">
              <BookOpen className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-lg">Instrukcja obslugi panelu</CardTitle>
              <CardDescription>Kliknij, aby rozwinac pelna instrukcje krok po kroku</CardDescription>
            </div>
          </div>
          <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </CardHeader>

      {isOpen && (
        <CardContent className="pt-0">
          <div className="flex gap-2 mb-4 flex-wrap">
            <button 
              onClick={(e) => { e.stopPropagation(); expandAll(); }}
              className="px-3 py-1.5 text-xs rounded-md bg-muted hover:bg-muted/80 transition-colors"
            >
              Rozwin wszystko
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); collapseAll(); }}
              className="px-3 py-1.5 text-xs rounded-md bg-muted hover:bg-muted/80 transition-colors"
            >
              Zwin wszystko
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); handleDownloadPDF(); }}
              className="px-3 py-1.5 text-xs rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1.5 ml-auto"
            >
              <Download className="h-3.5 w-3.5" />
              Pobierz jako PDF
            </button>
          </div>

          <div ref={printRef} className="space-y-1">
            {instructionSections.map((section, index) => (
              <div key={index} className="border rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                  onClick={(e) => { e.stopPropagation(); toggleSection(index); }}
                >
                  {expandedSections.has(index) 
                    ? <ChevronDown className="h-4 w-4 text-blue-400 shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  }
                  <span className="font-medium text-sm">{section.title}</span>
                </button>

                {expandedSections.has(index) && (
                  <div className="px-4 pb-4 pt-1 border-t bg-muted/10">
                    <div className="space-y-1">
                      {section.content.map((line, li) => {
                        if (line === "") return <div key={li} className="h-2" />;
                        if (line.startsWith("  •") || line.startsWith("  →")) {
                          return <p key={li} className="text-sm text-muted-foreground pl-4">{line.trim()}</p>;
                        }
                        if (line.match(/^(KROK \d|CO ROBI|JAK URUCHOMIC|ODLICZANIE|WAZNE|P:|O:)/)) {
                          const isQuestion = line.startsWith("P:");
                          const isAnswer = line.startsWith("O:");
                          return (
                            <p key={li} className={`text-sm ${isQuestion ? 'font-semibold text-blue-300 mt-2' : isAnswer ? 'text-muted-foreground mb-1' : 'font-semibold text-foreground mt-2'}`}>
                              {line}
                            </p>
                          );
                        }
                        return <p key={li} className="text-sm text-muted-foreground">{line}</p>;
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  });
  
  const { data: history, isLoading: isLoadingHistory } = useListOperationHistory({
    query: { queryKey: getListOperationHistoryQueryKey() }
  });

  if (isLoadingSummary || isLoadingHistory) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">Pulpit Operacyjny</h1>
        <p className="text-sm text-muted-foreground">Podsumowanie stanu przygotowan i ostatnich operacji.</p>
      </div>

      <InstructionPanel />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uczestnicy</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalParticipants || 0}</div>
            <p className="text-xs text-muted-foreground">Zarejestrowanych w systemie</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gotowi do wysylki</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{summary?.validatedOk || 0}</div>
            <p className="text-xs text-muted-foreground">Pozytywna walidacja</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bledy walidacji</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{summary?.validatedErrors || 0}</div>
            <p className="text-xs text-muted-foreground">Wymaga poprawy danych</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status Harmonogramu</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.scheduleSet ? "Gotowy" : "Brak"}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary?.scheduledStart 
                ? format(new Date(summary.scheduledStart), "dd MMM yyyy, HH:mm", { locale: pl })
                : "Skonfiguruj plan wysylki"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Ostatnie operacje</CardTitle>
            <CardDescription>Historia uruchomien walidacji, planowania i automatyzacji.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {history?.slice(0, 5).map((record) => (
                <div key={record.id} className="flex items-center">
                  <div className="bg-primary/10 p-2 rounded-full mr-4">
                    {record.operationType === 'validate' ? <CheckCircle className="h-4 w-4 text-primary" /> :
                     record.operationType === 'plan' ? <Calendar className="h-4 w-4 text-primary" /> :
                     <Activity className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="space-y-1 flex-1">
                    <p className="text-sm font-medium leading-none">
                      {record.operationType === 'validate' ? 'Walidacja Danych' :
                       record.operationType === 'plan' ? 'Generowanie Planu' : 'Automatyzacja'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {record.summary}
                    </p>
                  </div>
                  <div className="ml-auto font-medium text-xs text-muted-foreground flex items-center">
                    <Clock className="mr-1 h-3 w-3" />
                    {format(new Date(record.createdAt), "HH:mm, dd MMM", { locale: pl })}
                  </div>
                </div>
              ))}
              {(!history || history.length === 0) && (
                <div className="text-center py-8 text-muted-foreground">
                  Brak historii operacji
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Szybkie akcje</CardTitle>
            <CardDescription>Najczesciej uzywane narzedzia koordynatora.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => window.location.href = '/walidacja'}>
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-primary" />
                <div>
                  <div className="font-medium text-sm">Uruchom walidacje</div>
                  <div className="text-xs text-muted-foreground">Sprawdz poprawnosc danych</div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => window.location.href = '/plan'}>
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-primary" />
                <div>
                  <div className="font-medium text-sm">Zarzadzaj planem</div>
                  <div className="text-xs text-muted-foreground">Ustal harmonogram wysylki</div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => window.location.href = '/symulacja'}>
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-primary" />
                <div>
                  <div className="font-medium text-sm">Automatyzacja wysylki</div>
                  <div className="text-xs text-muted-foreground">Uruchom wysylanie wnioskow</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
