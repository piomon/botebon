import { useState, useEffect } from "react";
import { useGetSchedule, getGetScheduleQueryKey, useRunPlan } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Play, Calendar as CalendarIcon } from "lucide-react";
import { PlanReport } from "@workspace/api-client-react/src/generated/api.schemas";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

export default function Plan() {
  const { toast } = useToast();
  const { data: schedule } = useGetSchedule({
    query: { queryKey: getGetScheduleQueryKey() }
  });
  const runPlan = useRunPlan();

  const [startTime, setStartTime] = useState("");
  const [workers, setWorkers] = useState("1");
  const [spacingSec, setSpacingSec] = useState("60");
  const [report, setReport] = useState<PlanReport | null>(null);

  useEffect(() => {
    if (schedule) {
      if (schedule.startTime) {
        // Format for datetime-local input YYYY-MM-DDThh:mm
        const d = new Date(schedule.startTime);
        const iso = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0,16);
        setStartTime(iso);
      }
      setWorkers(schedule.workers.toString());
      setSpacingSec(schedule.spacingSec.toString());
    }
  }, [schedule]);

  const handleGenerate = async () => {
    try {
      const res = await runPlan.mutateAsync({
        data: {
          startTime: new Date(startTime).toISOString(),
          workers: parseInt(workers, 10),
          spacingSec: parseInt(spacingSec, 10)
        }
      });
      setReport(res);
      toast({ title: "Wygenerowano plan" });
    } catch (e: any) {
      toast({ title: "Błąd", description: "Nie udało się wygenerować planu", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Plan Wysyłki</h1>
        <p className="text-muted-foreground">Ustal harmonogram zautomatyzowanego wypełniania wniosków.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Parametry planu</CardTitle>
          <CardDescription>Skonfiguruj czas rozpoczęcia i tempo wprowadzania wniosków.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3 mb-6">
            <div className="space-y-2">
              <Label>Czas rozpoczęcia</Label>
              <Input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Liczba workerów (równoległych wątków)</Label>
              <Input type="number" min="1" value={workers} onChange={e => setWorkers(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Odstęp między wnioskami (sekundy)</Label>
              <Input type="number" min="0" value={spacingSec} onChange={e => setSpacingSec(e.target.value)} />
            </div>
          </div>
          <Button onClick={handleGenerate} disabled={runPlan.isPending || !startTime}>
            {runPlan.isPending ? "Generowanie..." : <><CalendarIcon className="mr-2 h-4 w-4" /> Generuj plan</>}
          </Button>
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardHeader>
            <CardTitle>Wygenerowany harmonogram</CardTitle>
            <CardDescription>Zplanowano {report.totalSlots} zgłoszeń.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Czas planowany</TableHead>
                  <TableHead>Worker</TableHead>
                  <TableHead>Uczestnik</TableHead>
                  <TableHead>Login</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.slots.map((slot) => (
                  <TableRow key={slot.slotId}>
                    <TableCell className="font-medium">
                      {format(new Date(slot.scheduledAt), "HH:mm:ss", { locale: pl })}
                    </TableCell>
                    <TableCell>Wątek #{slot.worker}</TableCell>
                    <TableCell>{slot.imie} {slot.nazwisko}</TableCell>
                    <TableCell className="text-muted-foreground">{slot.loginPortal}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
