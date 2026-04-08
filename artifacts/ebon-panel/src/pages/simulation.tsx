import { useState } from "react";
import { useRunSimulation } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Play, CheckCircle2, AlertCircle, ChevronRight } from "lucide-react";
import { SimulationReport } from "@workspace/api-client-react/src/generated/api.schemas";
import { useToast } from "@/hooks/use-toast";

export default function Simulation() {
  const { toast } = useToast();
  const runSimulation = useRunSimulation();
  const [report, setReport] = useState<SimulationReport | null>(null);

  const handleRun = async () => {
    try {
      const res = await runSimulation.mutateAsync();
      setReport(res);
      toast({ title: "Symulacja zakończona" });
    } catch (e: any) {
      toast({ title: "Błąd", description: "Nie udało się uruchomić symulacji", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Symulacja Procesu</h1>
          <p className="text-muted-foreground">Przetestuj proces aplikowania krok po kroku bez wysyłania danych do produkcji.</p>
        </div>
        <Button onClick={handleRun} disabled={runSimulation.isPending}>
          {runSimulation.isPending ? "Symulowanie..." : <><Play className="mr-2 h-4 w-4" /> Uruchom symulację</>}
        </Button>
      </div>

      {report && (
        <div className="space-y-6">
          <div className="text-sm font-medium text-muted-foreground">
            Wygenerowano: {new Date(report.generatedAt).toLocaleString('pl-PL')}
          </div>
          
          <div className="grid gap-6">
            {report.simulations.map((sim) => (
              <Card key={sim.participantId}>
                <CardHeader className="pb-3 border-b bg-muted/20">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {sim.imie} {sim.nazwisko} 
                      <span className="text-xs font-normal text-muted-foreground bg-background px-2 py-1 border rounded-md">{sim.loginPortal}</span>
                    </CardTitle>
                    {sim.finalStatus === 'success' ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        <CheckCircle2 className="mr-1 h-4 w-4" /> Sukces
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                        <AlertCircle className="mr-1 h-4 w-4" /> Błąd
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-4">
                    {sim.steps.map((step, idx) => (
                      <div key={idx} className="flex gap-4 items-start relative">
                        {idx < sim.steps.length - 1 && (
                          <div className="absolute left-3 top-8 bottom-[-16px] w-px bg-border z-0"></div>
                        )}
                        <div className="relative z-10 bg-background pt-1">
                          {step.status === 'ok' ? (
                            <CheckCircle2 className="h-6 w-6 text-green-500 bg-background" />
                          ) : (
                            <AlertCircle className="h-6 w-6 text-destructive bg-background" />
                          )}
                        </div>
                        <div className="flex-1 border rounded-lg p-3 bg-muted/10">
                          <div className="font-semibold text-sm mb-1">{step.screen}</div>
                          <div className="text-sm text-muted-foreground">{step.message}</div>
                          {step.fieldsUsed && Object.keys(step.fieldsUsed).length > 0 && (
                            <div className="mt-2 pt-2 border-t text-xs">
                              <div className="font-medium mb-1">Użyte pola:</div>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                {Object.entries(step.fieldsUsed).map(([k, v]) => (
                                  <div key={k} className="flex">
                                    <span className="text-muted-foreground mr-2">{k}:</span>
                                    <span className="font-mono truncate">{v}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
