import { useState } from "react";
import { 
  useListParticipants, 
  getListParticipantsQueryKey,
  useCreateParticipant,
  useUpdateParticipant,
  useDeleteParticipant
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit2, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Participant } from "@workspace/api-client-react/src/generated/api.schemas";

export default function Participants() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: participants, isLoading } = useListParticipants({
    query: { queryKey: getListParticipantsQueryKey() }
  });
  
  const createParticipant = useCreateParticipant();
  const updateParticipant = useUpdateParticipant();
  const deleteParticipant = useDeleteParticipant();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<Participant>>({});

  const handleSave = async () => {
    try {
      if (editingId) {
        await updateParticipant.mutateAsync({
          id: editingId,
          data: formData as any
        });
        toast({ title: "Zaktualizowano uczestnika" });
        setEditingId(null);
      } else {
        await createParticipant.mutateAsync({
          data: formData as any
        });
        toast({ title: "Dodano uczestnika" });
        setIsAddOpen(false);
      }
      queryClient.invalidateQueries({ queryKey: getListParticipantsQueryKey() });
      setFormData({});
    } catch (e: any) {
      toast({ title: "Błąd", description: e.message || "Nie udało się zapisać", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Czy na pewno chcesz usunąć tego uczestnika?")) {
      try {
        await deleteParticipant.mutateAsync({ id });
        toast({ title: "Usunięto uczestnika" });
        queryClient.invalidateQueries({ queryKey: getListParticipantsQueryKey() });
      } catch (e: any) {
        toast({ title: "Błąd", description: "Nie udało się usunąć", variant: "destructive" });
      }
    }
  };

  const openEdit = (p: Participant) => {
    setFormData(p);
    setEditingId(p.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Uczestnicy</h1>
          <p className="text-muted-foreground">Zarządzaj listą uczestników procesu rekrutacyjnego.</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if(!open) setFormData({}); setEditingId(null); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Dodaj uczestnika</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edytuj uczestnika" : "Nowy uczestnik"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label>Imię</Label>
                <Input value={formData.imie || ''} onChange={e => setFormData({...formData, imie: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Nazwisko</Label>
                <Input value={formData.nazwisko || ''} onChange={e => setFormData({...formData, nazwisko: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>PESEL</Label>
                <Input value={formData.pesel || ''} onChange={e => setFormData({...formData, pesel: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Telefon</Label>
                <Input value={formData.telefon || ''} onChange={e => setFormData({...formData, telefon: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Adres</Label>
                <Input value={formData.adres || ''} onChange={e => setFormData({...formData, adres: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Kod pocztowy</Label>
                <Input value={formData.kodPocztowy || ''} onChange={e => setFormData({...formData, kodPocztowy: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Miasto</Label>
                <Input value={formData.miasto || ''} onChange={e => setFormData({...formData, miasto: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Login Portal</Label>
                <Input value={formData.loginPortal || ''} onChange={e => setFormData({...formData, loginPortal: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Hasło</Label>
                <Input type="password" value={formData.haslo || ''} onChange={e => setFormData({...formData, haslo: e.target.value})} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSave} disabled={createParticipant.isPending || updateParticipant.isPending}>
                Zapisz
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Imię i nazwisko</TableHead>
              <TableHead>Kontakt</TableHead>
              <TableHead>Miasto</TableHead>
              <TableHead>PESEL</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Akcje</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center h-24">Ładowanie...</TableCell></TableRow>
            ) : participants?.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center h-24">Brak uczestników</TableCell></TableRow>
            ) : participants?.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.imie} {p.nazwisko}</TableCell>
                <TableCell>
                  <div className="text-sm">{p.email}</div>
                  <div className="text-xs text-muted-foreground">{p.telefon}</div>
                </TableCell>
                <TableCell>{p.miasto}</TableCell>
                <TableCell>{p.pesel}</TableCell>
                <TableCell>
                  {p.validationStatus === 'ok' ? (
                     <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                       <CheckCircle2 className="mr-1 h-3 w-3" /> OK
                     </span>
                  ) : p.validationStatus === 'error' ? (
                     <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                       <XCircle className="mr-1 h-3 w-3" /> Błąd
                     </span>
                  ) : (
                     <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                       Nie sprawdzono
                     </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => { openEdit(p); setIsAddOpen(true); }}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(p.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
