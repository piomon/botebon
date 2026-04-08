import { useState } from "react";
import { useRunValidation } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Play, CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
import { ValidationReport } from "@workspace/api-client-react/src/generated/api.schemas";
import { useToast } from "@/hooks/use-toast";

export default function Validation() {
  const { toast } = useToast();
  const runValidation = useRunValidation();
  const [report, setReport] = useState<ValidationReport | null>(null);

  const handleRun = async () => {
    try {
      const res = await runValidation.mutateAsync();
      setReport(res);
      toast({ title: "Walidacja zakończona" });
    } catch (e: any) {
      toast({ title: "Błąd", description: "Nie udało się uruchomić walidacji", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Walidacja Danych</h1>
          <p className="text-muted-foreground">Sprawdź kompletność i poprawność danych uczestników.</p>
        </div>
        <Button onClick={handleRun} disabled={runValidation.isPending}>
          {runValidation.isPending ? "Sprawdzanie..." : <><Play className="mr-2 h-4 w-4" /> Uruchom walidację</>}
        </Button>
      </div>

      {report && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Przetestowano</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{report.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Poprawne</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{report.ok}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Z błędami</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{report.errorsCount}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {report && (
        <Card>
          <CardHeader>
            <CardTitle>Wyniki szczegółowe</CardTitle>
            <CardDescription>Lista uczestników z problemami w danych.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {report.records.filter(r => !r.ok || r.warnings?.length > 0).map((record) => (
                <div key={record.participantId} className="flex flex-col p-4 border rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    {!record.ok ? <AlertCircle className="h-5 w-5 text-destructive" /> : <AlertTriangle className="h-5 w-5 text-amber-500" />}
                    <span className="font-medium">{record.imie} {record.nazwisko}</span>
                  </div>
                  {record.errors && record.errors.length > 0 && (
                    <div className="text-sm text-destructive pl-7">
                      <div className="font-semibold mb-1">Błędy:</div>
                      <ul className="list-disc pl-4 space-y-1">
                        {record.errors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  )}
                  {record.warnings && record.warnings.length > 0 && (
                    <div className="text-sm text-amber-600 pl-7 mt-2">
                      <div className="font-semibold mb-1">Ostrzeżenia:</div>
                      <ul className="list-disc pl-4 space-y-1">
                        {record.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
              {report.records.filter(r => !r.ok || r.warnings?.length > 0).length === 0 && (
                <div className="text-center py-8 text-green-600 flex flex-col items-center">
                  <CheckCircle2 className="h-12 w-12 mb-4 opacity-50" />
                  <p>Wszyscy uczestnicy przeszli walidację pomyślnie!</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
