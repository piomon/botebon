import { 
  useGetDashboardSummary, 
  getGetDashboardSummaryQueryKey,
  useListOperationHistory,
  getListOperationHistoryQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, CheckCircle, AlertTriangle, Calendar, Activity, Clock } from "lucide-react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

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
        <h1 className="text-3xl font-bold tracking-tight">Pulpit Operacyjny</h1>
        <p className="text-muted-foreground">Podsumowanie stanu przygotowań i ostatnich operacji.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
            <CardTitle className="text-sm font-medium">Gotowi do wysyłki</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{summary?.validatedOk || 0}</div>
            <p className="text-xs text-muted-foreground">Pozytywna walidacja</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Błędy walidacji</CardTitle>
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
                : "Skonfiguruj plan wysyłki"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Ostatnie operacje</CardTitle>
            <CardDescription>Historia uruchomień walidacji, planowania i symulacji.</CardDescription>
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
                       record.operationType === 'plan' ? 'Generowanie Planu' : 'Symulacja'}
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
        
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Szybkie akcje</CardTitle>
            <CardDescription>Najczęściej używane narzędzia koordynatora.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => window.location.href = '/walidacja'}>
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-primary" />
                <div>
                  <div className="font-medium text-sm">Uruchom walidację</div>
                  <div className="text-xs text-muted-foreground">Sprawdź poprawność danych</div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => window.location.href = '/plan'}>
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-primary" />
                <div>
                  <div className="font-medium text-sm">Zarządzaj planem</div>
                  <div className="text-xs text-muted-foreground">Ustal harmonogram wysyłki</div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => window.location.href = '/symulacja'}>
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-primary" />
                <div>
                  <div className="font-medium text-sm">Symulacja wysyłki</div>
                  <div className="text-xs text-muted-foreground">Przetestuj proces aplikowania</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
