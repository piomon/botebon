import { useState, useEffect, useRef } from "react";
import { useListParticipants, getListParticipantsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Play, CheckCircle2, AlertCircle, XCircle, Globe, Lock, 
  Monitor, Loader2, Clock, Users, Zap, StopCircle,
  ChevronDown, ChevronUp, Image as ImageIcon
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

const NABOR_INFO = {
  name: 'NABOR 9 "Nabor z Bilansem Kompetencji i doradztwem zawodowym"',
  openDate: "2026-04-10T16:00:00+02:00",
  closeDate: "2026-04-16T16:00:00+02:00",
  portal: "https://projektebon.pl",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "ok") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3" /> OK</span>;
  if (status === "error") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><XCircle className="h-3 w-3" /> Blad</span>;
  if (status === "skip") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"><AlertCircle className="h-3 w-3" /> Pominieto</span>;
  if (status === "stop") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800"><StopCircle className="h-3 w-3" /> STOP</span>;
  return <span className="text-xs text-muted-foreground">{status}</span>;
}

function Countdown({ targetDate }: { targetDate: string }) {
  const [diff, setDiff] = useState("");
  const [isPast, setIsPast] = useState(false);

  useEffect(() => {
    const update = () => {
      const now = new Date().getTime();
      const target = new Date(targetDate).getTime();
      const d = target - now;
      if (d <= 0) {
        setIsPast(true);
        setDiff("Nabor jest otwarty!");
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
      <div className="text-xs text-muted-foreground mb-1">{isPast ? "Status naboru" : "Otwarcie naboru za"}</div>
      <div className={`text-2xl font-bold font-mono ${isPast ? 'text-green-700' : 'text-orange-700'}`}>{diff}</div>
    </div>
  );
}

export default function Simulation() {
  const { toast } = useToast();
  const { data: participants, isLoading } = useListParticipants({
    query: { queryKey: getListParticipantsQueryKey() }
  });

  const [mode, setMode] = useState<"idle" | "single" | "all">("idle");
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [singleResult, setSingleResult] = useState<AutomationResult | null>(null);
  const [allJobId, setAllJobId] = useState<string | null>(null);
  const [allStatus, setAllStatus] = useState<any>(null);
  const [expandedScreenshots, setExpandedScreenshots] = useState<Record<string, boolean>>({});
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runSingle = async () => {
    if (!selectedParticipantId) return;
    setRunning(true);
    setSingleResult(null);
    setMode("single");

    try {
      const res = await fetch(`${API_BASE}/automation/run-single-sync/${selectedParticipantId}`, { method: "POST" });
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
      const res = await fetch(`${API_BASE}/automation/run-all`, { method: "POST" });
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

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Automatyzacja Portalu</h1>
        <p className="text-muted-foreground">Prawdziwa automatyzacja przegladarki — logowanie i wypelnianie formularzy na projektebon.pl</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <div className="text-xs text-muted-foreground mt-1">Zamkniecie: 16.04.2026, godz. 16:00</div>
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
            <Monitor className="h-5 w-5" /> Uruchom automatyzacje
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-4 space-y-3">
              <div className="font-medium text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-blue-600" /> Pojedynczy uczestnik
              </div>
              <Select value={selectedParticipantId} onValueChange={setSelectedParticipantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz uczestnika..." />
                </SelectTrigger>
                <SelectContent>
                  {participants?.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.imie} {p.nazwisko}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={runSingle} disabled={running || !selectedParticipantId} className="w-full">
                {running && mode === "single" ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Trwa automatyzacja...</>
                ) : (
                  <><Play className="mr-2 h-4 w-4" /> Uruchom dla wybranego</>
                )}
              </Button>
            </div>

            <div className="border rounded-lg p-4 space-y-3">
              <div className="font-medium text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-green-600" /> Wszyscy uczestnicy
              </div>
              <div className="text-sm text-muted-foreground">
                Uruchomi automatyzacje kolejno dla {participants?.length || 0} uczestnikow.
                Kazdy zostanie zalogowany i formularz zostanie wypelniony.
              </div>
              <Button onClick={runAll} disabled={running} variant="outline" className="w-full">
                {running && mode === "all" ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Trwa automatyzacja...</>
                ) : (
                  <><Play className="mr-2 h-4 w-4" /> Uruchom dla wszystkich</>
                )}
              </Button>
            </div>
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center gap-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded p-3">
              <StopCircle className="h-4 w-4 shrink-0" />
              <span>
                Automatyzacja wypelnia formularz, ale <strong>NIE wysyla wniosku</strong>.
                Ostatni krok wymaga recznego potwierdzenia na portalu.
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {running && mode === "single" && (
        <Card>
          <CardContent className="pt-6 flex items-center justify-center gap-3 py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-muted-foreground">Przegladarka pracuje — logowanie i wypelnianie formularza...</span>
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
