import { useState, useEffect } from "react";
import { useGetSchedule, getGetScheduleQueryKey, useUpdateSchedule } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: schedule, isLoading } = useGetSchedule({
    query: { queryKey: getGetScheduleQueryKey() }
  });
  const updateSchedule = useUpdateSchedule();

  const [formData, setFormData] = useState({
    portalUrl: "",
    workers: "1",
    spacingSec: "60"
  });

  useEffect(() => {
    if (schedule) {
      setFormData({
        portalUrl: schedule.portalUrl || "",
        workers: schedule.workers.toString(),
        spacingSec: schedule.spacingSec.toString()
      });
    }
  }, [schedule]);

  const handleSave = async () => {
    try {
      await updateSchedule.mutateAsync({
        data: {
          startTime: schedule?.startTime || new Date().toISOString(), // Keep existing or set current
          portalUrl: formData.portalUrl,
          workers: parseInt(formData.workers, 10),
          spacingSec: parseInt(formData.spacingSec, 10)
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetScheduleQueryKey() });
      toast({ title: "Ustawienia zapisane" });
    } catch (e: any) {
      toast({ title: "Błąd", description: "Nie udało się zapisać ustawień", variant: "destructive" });
    }
  };

  if (isLoading) {
    return <div className="p-8">Ładowanie...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ustawienia Globalne</h1>
        <p className="text-muted-foreground">Konfiguracja środowiska i domyślnych parametrów systemu EBON.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Środowisko Docelowe</CardTitle>
          <CardDescription>Adres portalu, na który będą wysyłane wnioski.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Adres URL Portalu (Portal URL)</Label>
            <Input 
              value={formData.portalUrl} 
              onChange={e => setFormData({...formData, portalUrl: e.target.value})} 
              placeholder="https://..."
            />
            <p className="text-xs text-muted-foreground">Pełny adres URL środowiska rekrutacyjnego.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Domyślne parametry planowania</CardTitle>
          <CardDescription>Te wartości będą sugerowane domyślnie podczas tworzenia planu wysyłki.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Domyślna liczba równoległych wątków (workers)</Label>
            <Input 
              type="number" 
              min="1" 
              value={formData.workers} 
              onChange={e => setFormData({...formData, workers: e.target.value})} 
            />
          </div>
          <div className="space-y-2">
            <Label>Domyślny odstęp w sekundach (spacing)</Label>
            <Input 
              type="number" 
              min="0" 
              value={formData.spacingSec} 
              onChange={e => setFormData({...formData, spacingSec: e.target.value})} 
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateSchedule.isPending}>
          {updateSchedule.isPending ? "Zapisywanie..." : <><Save className="mr-2 h-4 w-4" /> Zapisz ustawienia</>}
        </Button>
      </div>
    </div>
  );
}
