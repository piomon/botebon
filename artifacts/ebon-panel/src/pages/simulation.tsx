import { useState, useEffect, useRef } from "react";
import { useListParticipants, getListParticipantsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Play, CheckCircle2, AlertCircle, XCircle, Globe, Lock, 
  Monitor, Loader2, Clock, Users, Zap, StopCircle,
  ChevronDown, ChevronUp, Image as ImageIcon, LogIn, Send, Trash2, RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

interface StepLog {
  step: string;
  status: "ok" | "error" | "skip" | "stop";
  message: string;
  timestamp: string;
  screenshotBase64?: string;
}

interface AutomationResult {
  participantId: number;
  imie: string;
  nazwisko: string;
  loginPortal: string;
  status: "completed" | "error" | "stopped";
  steps: StepLog[];
  startedAt: string;
  finishedAt: string;
}

interface FstSessionInfo {
  participantId: number;
  imie: string;
  nazwisko: string;
  loginPortal: string;
  status: string;
  error?: string;
  readyAt?: string;
  stepsCount: number;
  lastStep?: string;
}

const NABOR_INFO = {
  name: 'NABOR 9 "Nabor z Bilansem Kompetencji i doradztwem zawodowym"',
  openDate: "2026-04-10T16:00:00+02:00",
  closeDate: "2026-04-16T17:00:00+02:00",
  portal: "https://projektebon.pl",
};

const FST_NABOR = {
  name: "Mennica Uslug Szkoleniowych 3",
  submitDate: "2026-04-14T09:00:00+02:00",
  portal: "https://fst-lodzkie.teradane.com",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "ok" || status === "completed") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3" /> OK</span>;
  if (status === "error") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><XCircle className="h-3 w-3" /> Blad</span>;
  if (status === "skip") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"><AlertCircle className="h-3 w-3" /> Pominieto</span>;
  if (status === "stop" || status === "stopped") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800"><StopCircle className="h-3 w-3" /> STOP</span>;
  if (status === "ready") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3" /> Gotowy</span>;
  if (status === "logging_in") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><Loader2 className="h-3 w-3 animate-spin" /> Logowanie</span>;
  if (status === "submitting") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800"><Loader2 className="h-3 w-3 animate-spin" /> Skladanie</span>;
  if (status === "done") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3" /> Gotowe</span>;
  return <span className="text-xs text-muted-foreground">{status}</span>;
}

function Countdown({ targetDate, label }: { targetDate: string; label?: string }) {
  const [diff, setDiff] = useState("");
  const [isPast, setIsPast] = useState(false);

  useEffect(() => {
    const update = () => {
      const now = new Date().getTime();
      const target = new Date(targetDate).getTime();
      const d = target - now;
      if (d <= 0) {
        setIsPast(true);
        setDiff("CZAS START!");
        return;
      }
      const days = Math.floor(d / (1000 * 60 * 60 * 24));
      const hours = Math.floor((d % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((d % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((d % (1000 * 60)) / 1000);
      setDiff(`${days}d ${hours}h ${mins}m ${secs}s`);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  return (
    <div className={`text-center p-4 rounded-lg border-2 ${isPast ? 'border-green-400 bg-green-50' : 'border-orange-300 bg-orange-50'}`}>
      <div className="text-xs text-muted-foreground mb-1">{label || (isPast ? "Status" : "Odliczanie")}</div>
      <div className={`text-2xl font-bold font-mono ${isPast ? 'text-green-700' : 'text-orange-700'}`}>{diff}</div>
    </div>
  );
}

export default function Simulation() {
  const { toast } = useToast();
  const { data: participants, isLoading } = useListParticipants({
    query: { queryKey: getListParticipantsQueryKey() }
  });

  const [portal, setPortal] = useState<"ebon" | "fst">("ebon");
  const [mode, setMode] = useState<"idle" | "single" | "all">("idle");
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [singleResult, setSingleResult] = useState<AutomationResult | null>(null);
  const [allJobId, setAllJobId] = useState<string | null>(null);
  const [allStatus, setAllStatus] = useState<any>(null);
  const [expandedScreenshots, setExpandedScreenshots] = useState<Record<string, boolean>>({});
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [prewarmStatus, setPrewarmStatus] = useState<"idle" | "warming" | "ok" | "error">("idle");
  const [prewarmMs, setPrewarmMs] = useState<number | null>(null);

  const [fstSessions, setFstSessions] = useState<FstSessionInfo[]>([]);
  const [fstPreloginRunning, setFstPreloginRunning] = useState(false);
  const [fstSubmitRunning, setFstSubmitRunning] = useState(false);
  const fstPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchFstSessions = async () => {
    try {
      const res = await fetch(`${API_BASE}/automation/fst-sessions`);
      const data = await res.json();
      setFstSessions(data.sessions || []);
    } catch {}
  };

  useEffect(() => {
    if (portal === "fst") {
      fetchFstSessions();
      fstPollingRef.current = setInterval(fetchFstSessions, 3000);
    }
    return () => {
      if (fstPollingRef.current) clearInterval(fstPollingRef.current);
    };
  }, [portal]);

  const runPrewarm = async () => {
    setPrewarmStatus("warming");
    try {
      const res = await fetch(`${API_BASE}/automation/prewarm`, { method: "POST" });
      const data = await res.json();
      setPrewarmMs(data.ms);
      setPrewarmStatus(data.ok ? "ok" : "error");
      toast({ title: data.ok ? `Serwer rozgrzany (${data.ms}ms)` : `Blad rozgrzewki: ${data.error}` });
    } catch (err: any) {
      setPrewarmStatus("error");
      toast({ title: "Blad", description: err.message, variant: "destructive" });
    }
  };

  const runSingle = async () => {
    if (!selectedParticipantId) return;
    setRunning(true);
    setSingleResult(null);
    setMode("single");

    try {
      const res = await fetch(`${API_BASE}/automation/run-single-sync/${selectedParticipantId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portal }),
      });
      const data = await res.json();
      setSingleResult(data);
      toast({ title: `Automatyzacja zakonczona: ${data.status}` });
    } catch (err: any) {
      toast({ title: "Blad", description: err.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const runAll = async () => {
    setRunning(true);
    setMode("all");
    setAllStatus(null);

    try {
      const res = await fetch(`${API_BASE}/automation/run-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portal }),
      });
      const data = await res.json();
      setAllJobId(data.jobId);
      toast({ title: `Uruchomiono automatyzacje dla ${data.total} uczestnikow` });

      pollingRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_BASE}/automation/status/${data.jobId}`);
          const statusData = await statusRes.json();
          setAllStatus(statusData);
          if (statusData.status === "completed" || statusData.status === "error") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setRunning(false);
            toast({ title: `Automatyzacja zakonczona: ${statusData.status}` });
          }
        } catch {}
      }, 3000);
    } catch (err: any) {
      toast({ title: "Blad", description: err.message, variant: "destructive" });
      setRunning(false);
    }
  };

  const runFstPrelogin = async () => {
    setFstPreloginRunning(true);
    try {
      const res = await fetch(`${API_BASE}/automation/fst-prelogin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concurrency: 3 }),
      });
      const data = await res.json();
      toast({ title: data.message });
    } catch (err: any) {
      toast({ title: "Blad", description: err.message, variant: "destructive" });
    }
    setTimeout(() => setFstPreloginRunning(false), 5000);
  };

  const runFstSubmit = async (autoSubmit: boolean) => {
    setFstSubmitRunning(true);
    try {
      const res = await fetch(`${API_BASE}/automation/fst-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concurrency: 3, autoSubmit }),
      });
      const data = await res.json();
      toast({ title: data.message });
    } catch (err: any) {
      toast({ title: "Blad", description: err.message, variant: "destructive" });
    }
    setTimeout(() => setFstSubmitRunning(false), 5000);
  };

  const runFstCleanup = async () => {
    try {
      const res = await fetch(`${API_BASE}/automation/fst-cleanup`, { method: "POST" });
      const data = await res.json();
      toast({ title: data.message });
      setFstSessions([]);
    } catch (err: any) {
      toast({ title: "Blad", description: err.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (fstPollingRef.current) clearInterval(fstPollingRef.current);
    };
  }, []);

  const toggleScreenshot = (key: string) => {
    setExpandedScreenshots(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const renderSteps = (steps: StepLog[], keyPrefix: string) => (
    <div className="space-y-2">
      {steps.map((step, idx) => {
        const screenshotKey = `${keyPrefix}-${idx}`;
        return (
          <div key={idx} className="border rounded-lg overflow-hidden">
            <div className="flex items-start gap-3 p-3 bg-muted/10">
              <div className="pt-0.5">
                {step.status === "ok" ? <CheckCircle2 className="h-4 w-4 text-green-600" /> :
                 step.status === "error" ? <XCircle className="h-4 w-4 text-red-600" /> :
                 step.status === "stop" ? <StopCircle className="h-4 w-4 text-orange-600" /> :
                 <AlertCircle className="h-4 w-4 text-yellow-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-sm">{step.step}</span>
                  <StatusBadge status={step.status} />
                </div>
                <div className="text-xs text-muted-foreground break-all">{step.message}</div>
                <div className="text-xs text-muted-foreground/60 mt-1">{new Date(step.timestamp).toLocaleString('pl-PL')}</div>
              </div>
              {step.screenshotBase64 && (
                <button
                  onClick={() => toggleScreenshot(screenshotKey)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border rounded px-2 py-1"
                >
                  <ImageIcon className="h-3 w-3" />
                  {expandedScreenshots[screenshotKey] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              )}
            </div>
            {step.screenshotBase64 && expandedScreenshots[screenshotKey] && (
              <div className="border-t p-2 bg-black/5">
                <img
                  src={`data:image/jpeg;base64,${step.screenshotBase64}`}
                  alt={`Zrzut ekranu: ${step.step}`}
                  className="w-full rounded border shadow-sm"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const readySessions = fstSessions.filter(s => s.status === "ready");
  const errorSessions = fstSessions.filter(s => s.status === "error");
  const activeSessions = fstSessions.filter(s => s.status === "logging_in" || s.status === "submitting");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">Automatyzacja Portalu</h1>
        <p className="text-sm text-muted-foreground">Automatyzacja przegladarki — logowanie i wypelnianie formularzy</p>
      </div>

      <Card className={portal === "ebon" ? "border-blue-200 bg-blue-50/30" : "border-purple-200 bg-purple-50/30"}>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <Globe className={`h-5 w-5 ${portal === "ebon" ? "text-blue-600" : "text-purple-600"}`} />
              <span className="font-semibold text-sm">Wybierz portal:</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant={portal === "ebon" ? "default" : "outline"}
                size="sm"
                onClick={() => { setPortal("ebon"); setSelectedParticipantId(""); }}
                disabled={running}
                className={portal === "ebon" ? "bg-blue-600 hover:bg-blue-700" : ""}
              >
                EBON (projektebon.pl)
              </Button>
              <Button
                variant={portal === "fst" ? "default" : "outline"}
                size="sm"
                onClick={() => { setPortal("fst"); setSelectedParticipantId(""); }}
                disabled={running}
                className={portal === "fst" ? "bg-purple-600 hover:bg-purple-700" : ""}
              >
                FST (teradane.com)
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-yellow-200 bg-yellow-50/50">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1">
              <div className="font-semibold text-sm flex items-center gap-2 mb-1">
                <Zap className="h-4 w-4 text-yellow-600" /> Rozgrzewka serwera
              </div>
              <div className="text-xs text-muted-foreground">
                Kliknij przed naborem, aby rozgrzac serwer i Chromium.
                {prewarmMs !== null && <span className="ml-2 font-medium">Czas: {prewarmMs}ms</span>}
              </div>
            </div>
            <Button
              onClick={runPrewarm}
              disabled={prewarmStatus === "warming"}
              variant={prewarmStatus === "ok" ? "outline" : "default"}
              className="shrink-0"
            >
              {prewarmStatus === "warming" ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Rozgrzewam...</>
              ) : prewarmStatus === "ok" ? (
                <><CheckCircle2 className="mr-2 h-4 w-4 text-green-600" /> Gotowy</>
              ) : (
                <><Zap className="mr-2 h-4 w-4" /> Rozgrzej serwer</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ========== EBON Portal ========== */}
      {portal === "ebon" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="h-5 w-5 text-blue-600" />
                  <span className="font-semibold text-sm">Portal</span>
                </div>
                <div className="text-sm font-mono text-muted-foreground">{NABOR_INFO.portal}</div>
                <div className="text-xs text-muted-foreground mt-1">{NABOR_INFO.name}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-5 w-5 text-orange-600" />
                  <span className="font-semibold text-sm">Otwarcie naboru</span>
                </div>
                <div className="text-sm">10.04.2026, godz. 16:00</div>
                <div className="text-xs text-muted-foreground mt-1">Zamkniecie: 16.04.2026, godz. 17:00</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <Countdown targetDate={NABOR_INFO.openDate} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Monitor className="h-5 w-5" /> Uruchom automatyzacje EBON
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="font-medium text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4 text-blue-600" /> Pojedynczy uczestnik
                  </div>
                  <Select value={selectedParticipantId} onValueChange={setSelectedParticipantId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz uczestnika..." />
                    </SelectTrigger>
                    <SelectContent>
                      {participants?.filter((p: any) => {
                        const pp = p.portal || "ebon";
                        return pp === "ebon" || pp === "both";
                      }).map((p: any) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.imie} {p.nazwisko}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={runSingle} disabled={running || !selectedParticipantId} className="w-full">
                    {running && mode === "single" ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Trwa...</>
                    ) : (
                      <><Play className="mr-2 h-4 w-4" /> Uruchom</>
                    )}
                  </Button>
                </div>

                <div className="border rounded-lg p-4 space-y-3">
                  <div className="font-medium text-sm flex items-center gap-2">
                    <Users className="h-4 w-4 text-green-600" /> Wszyscy uczestnicy
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Uruchomi dla {participants?.filter((p: any) => { const pp = p.portal || "ebon"; return pp === "ebon" || pp === "both"; }).length || 0} uczestnikow EBON.
                  </div>
                  <Button onClick={runAll} disabled={running} variant="outline" className="w-full">
                    {running && mode === "all" ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Trwa...</>
                    ) : (
                      <><Play className="mr-2 h-4 w-4" /> Uruchom dla wszystkich</>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ========== FST Portal — Two-Phase System ========== */}
      {portal === "fst" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="h-5 w-5 text-purple-600" />
                  <span className="font-semibold text-sm">Portal FST</span>
                </div>
                <div className="text-sm font-mono text-muted-foreground">{FST_NABOR.portal}</div>
                <div className="text-xs text-muted-foreground mt-1">{FST_NABOR.name}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-5 w-5 text-purple-600" />
                  <span className="font-semibold text-sm">Skladanie wnioskow</span>
                </div>
                <div className="text-sm font-bold text-red-600">14.04.2026, godz. 9:00</div>
                <div className="text-xs text-muted-foreground mt-1">Wnioski musza byc zlozone rownoczesnie</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <Countdown targetDate={FST_NABOR.submitDate} label="Do skladania wnioskow" />
              </CardContent>
            </Card>
          </div>

          <Card className="border-purple-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <LogIn className="h-5 w-5 text-purple-600" /> FAZA 1: Pre-login (przed 9:00)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-sm">
                <strong>Strategia:</strong> Wszyscy uczestnicy FST zostana zalogowani i przegladarki beda czekac
                na stronie "Zloz wniosek". Kiedy nabor sie otworzy o 9:00, od razu mozna kliknac FAZA 2.
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={runFstPrelogin}
                  disabled={fstPreloginRunning || fstSubmitRunning}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {fstPreloginRunning ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Logowanie...</>
                  ) : (
                    <><LogIn className="mr-2 h-4 w-4" /> Zaloguj wszystkich ({participants?.filter((p: any) => { const pp = p.portal || "ebon"; return pp === "fst" || pp === "both"; }).length || 0})</>
                  )}
                </Button>
                <Button variant="outline" onClick={fetchFstSessions} size="sm">
                  <RefreshCw className="mr-2 h-4 w-4" /> Odswierz status
                </Button>
                <Button variant="destructive" onClick={runFstCleanup} size="sm" disabled={fstSessions.length === 0}>
                  <Trash2 className="mr-2 h-4 w-4" /> Zamknij przegladarki
                </Button>
              </div>

              {fstSessions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="font-medium">Sesje:</span>
                    <span className="text-green-700">{readySessions.length} gotowych</span>
                    {activeSessions.length > 0 && <span className="text-blue-700">{activeSessions.length} w trakcie</span>}
                    {errorSessions.length > 0 && <span className="text-red-700">{errorSessions.length} bledow</span>}
                  </div>
                  <div className="grid gap-2">
                    {fstSessions.map(s => (
                      <div key={s.participantId} className="flex items-center justify-between border rounded px-3 py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{s.imie} {s.nazwisko}</span>
                          <span className="text-xs text-muted-foreground">{s.loginPortal}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={s.status} />
                          {s.error && <span className="text-xs text-red-600">{s.error.substring(0, 50)}</span>}
                          {s.readyAt && <span className="text-xs text-muted-foreground">{new Date(s.readyAt).toLocaleTimeString('pl-PL')}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Send className="h-5 w-5 text-red-600" /> FAZA 2: Zloz wnioski (o 9:00!)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm">
                <strong>UWAGA:</strong> Kliknij dopiero gdy nabor sie otworzy! Wszystkie zalogowane przegladarki
                jednoczesnie zaczna wypelniac i skladac wnioski. Gotowych sesji: <strong>{readySessions.length}</strong>.
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => runFstSubmit(true)}
                  disabled={fstSubmitRunning || readySessions.length === 0}
                  className="bg-red-600 hover:bg-red-700"
                  size="lg"
                >
                  {fstSubmitRunning ? (
                    <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Skladanie wnioskow...</>
                  ) : (
                    <><Send className="mr-2 h-5 w-5" /> ZLOZ WNIOSKI ({readySessions.length})</>
                  )}
                </Button>
                <Button
                  onClick={() => runFstSubmit(false)}
                  disabled={fstSubmitRunning || readySessions.length === 0}
                  variant="outline"
                >
                  <Play className="mr-2 h-4 w-4" /> Wypelnij bez wysylania (test)
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Monitor className="h-5 w-5" /> Pojedynczy test FST
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border rounded-lg p-4 space-y-3">
                <Select value={selectedParticipantId} onValueChange={setSelectedParticipantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz uczestnika FST..." />
                  </SelectTrigger>
                  <SelectContent>
                    {participants?.filter((p: any) => {
                      const pp = p.portal || "ebon";
                      return pp === "fst" || pp === "both";
                    }).map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.imie} {p.nazwisko}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={runSingle} disabled={running || !selectedParticipantId} className="w-full" variant="outline">
                  {running && mode === "single" ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Trwa...</>
                  ) : (
                    <><Play className="mr-2 h-4 w-4" /> Test pojedynczego (pelny cykl)</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ========== Results ========== */}
      {running && mode === "single" && (
        <Card>
          <CardContent className="pt-6 flex items-center justify-center gap-3 py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-muted-foreground">Przegladarka pracuje...</span>
          </CardContent>
        </Card>
      )}

      {singleResult && (
        <Card>
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {singleResult.imie} {singleResult.nazwisko}
                <span className="text-sm font-normal text-muted-foreground ml-2">{singleResult.loginPortal}</span>
              </CardTitle>
              <StatusBadge status={singleResult.status} />
            </div>
            <div className="text-xs text-muted-foreground">
              Start: {new Date(singleResult.startedAt).toLocaleString('pl-PL')} | 
              Koniec: {new Date(singleResult.finishedAt).toLocaleString('pl-PL')}
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {renderSteps(singleResult.steps, `single-${singleResult.participantId}`)}
          </CardContent>
        </Card>
      )}

      {allStatus && (
        <Card>
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Automatyzacja masowa</CardTitle>
              <div className="flex items-center gap-2">
                {allStatus.status === "running" && <Loader2 className="h-4 w-4 animate-spin" />}
                <StatusBadge status={allStatus.status} />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Uczestnicy: {allStatus.completedCount} / {allStatus.totalParticipants} |
              Start: {new Date(allStatus.startedAt).toLocaleString('pl-PL')}
              {allStatus.finishedAt && ` | Koniec: ${new Date(allStatus.finishedAt).toLocaleString('pl-PL')}`}
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {allStatus.results?.map((r: AutomationResult) => (
              <div key={r.participantId} className="border rounded-lg overflow-hidden">
                <div className="bg-muted/20 px-4 py-2 flex items-center justify-between border-b">
                  <span className="font-medium text-sm">{r.imie} {r.nazwisko}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="p-4">
                  {renderSteps(r.steps, `all-${r.participantId}`)}
                </div>
              </div>
            ))}

            {allStatus.status === "running" && Object.entries(allStatus.progress || {}).map(([pid, steps]) => (
              <div key={pid} className="border rounded-lg overflow-hidden">
                <div className="bg-blue-50 px-4 py-2 flex items-center gap-2 border-b">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="font-medium text-sm">Uczestnik #{pid} — w trakcie</span>
                </div>
                <div className="p-4">
                  {renderSteps(steps as StepLog[], `progress-${pid}`)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
