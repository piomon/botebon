import React, { useState } from "react";
import { 
  useListParticipants, 
  getListParticipantsQueryKey,
  useCreateParticipant,
  useUpdateParticipant,
  useDeleteParticipant
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Edit2, Trash2, CheckCircle2, XCircle, Eye, EyeOff, ChevronDown, ChevronUp, Copy, User } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

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
  validationStatus?: string | null;
  createdAt?: string;
}

const emptyForm: Partial<Participant> = {
  imie: "", nazwisko: "", pesel: "", email: "", telefon: "",
  adres: "", kodPocztowy: "", miasto: "", loginPortal: "", haslo: "", notatki: ""
};

export default function Participants() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: participants, isLoading } = useListParticipants({
    query: { queryKey: getListParticipantsQueryKey() }
  });
  
  const createParticipant = useCreateParticipant();
  const updateParticipant = useUpdateParticipant();
  const deleteParticipant = useDeleteParticipant();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<Participant>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<number, boolean>>({});

  const handleSave = async () => {
    try {
      if (editingId) {
        await updateParticipant.mutateAsync({ id: editingId, data: formData as any });
        toast({ title: "Zaktualizowano uczestnika" });
      } else {
        await createParticipant.mutateAsync({ data: formData as any });
        toast({ title: "Dodano uczestnika" });
      }
      queryClient.invalidateQueries({ queryKey: getListParticipantsQueryKey() });
      closeForm();
    } catch (e: any) {
      toast({ title: "Blad", description: e.message || "Nie udalo sie zapisac", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Czy na pewno chcesz usunac tego uczestnika?")) {
      try {
        await deleteParticipant.mutateAsync({ id });
        toast({ title: "Usunieto uczestnika" });
        queryClient.invalidateQueries({ queryKey: getListParticipantsQueryKey() });
        if (expandedId === id) setExpandedId(null);
      } catch {
        toast({ title: "Blad", description: "Nie udalo sie usunac", variant: "destructive" });
      }
    }
  };

  const openAdd = () => {
    setFormData({ ...emptyForm });
    setEditingId(null);
    setIsFormOpen(true);
  };

  const openEdit = (p: Participant) => {
    setFormData({ ...p });
    setEditingId(p.id);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setFormData({});
    setEditingId(null);
  };

  const togglePassword = (id: number) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `Skopiowano ${label}` });
  };

  const StatusBadge = ({ status }: { status?: string | null }) => {
    if (status === 'ok') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle2 className="mr-1 h-3 w-3" /> OK</span>;
    if (status === 'error') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><XCircle className="mr-1 h-3 w-3" /> Blad</span>;
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Nie sprawdzono</span>;
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">Uczestnicy</h1>
          <p className="text-sm text-muted-foreground hidden sm:block">Podglad i edycja danych uczestnikow procesu rekrutacyjnego.</p>
        </div>
        <Button onClick={openAdd} size="sm" className="shrink-0">
          <Plus className="mr-1 h-4 w-4" /> <span className="hidden sm:inline">Dodaj</span><span className="sm:hidden">Dodaj</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-24"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : participants?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg">Brak uczestnikow</div>
      ) : (
        <div className="space-y-2">
          {participants?.map((p: any) => {
            const isExpanded = expandedId === p.id;
            const passVisible = showPasswords[p.id];
            return (
              <div key={p.id} className="border rounded-lg bg-card overflow-hidden">
                {/* Collapsed row */}
                <div
                  className={`flex items-center gap-2 sm:gap-3 p-3 sm:p-4 cursor-pointer hover:bg-muted/40 transition-colors ${isExpanded ? 'border-b' : ''}`}
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}
                >
                  <div className="bg-primary/10 p-1.5 sm:p-2 rounded-full shrink-0">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm sm:text-base">{p.imie} {p.nazwisko}</span>
                      <StatusBadge status={p.validationStatus} />
                    </div>
                    <div className="text-xs sm:text-sm text-muted-foreground truncate">{p.email}</div>
                    <div className="text-xs text-muted-foreground sm:hidden">{p.miasto}</div>
                  </div>
                  <div className="hidden sm:block text-sm text-muted-foreground">{p.miasto}</div>
                  <div className="shrink-0">
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="p-3 sm:p-4 bg-muted/5 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Imie</div>
                        <div className="font-medium">{p.imie}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Nazwisko</div>
                        <div className="font-medium">{p.nazwisko}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">PESEL</div>
                        <div className="font-mono text-sm">{p.pesel}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Email</div>
                        <div className="font-mono text-xs sm:text-sm break-all">{p.email}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Telefon</div>
                        <div>{p.telefon}</div>
                      </div>
                      <div className="sm:col-span-2 md:col-span-3">
                        <div className="text-xs text-muted-foreground mb-0.5">Adres</div>
                        <div>{p.adres}, {p.kodPocztowy} {p.miasto}</div>
                      </div>
                      <div className="sm:col-span-2">
                        <div className="text-xs text-muted-foreground mb-0.5">Login portalu</div>
                        <div className="font-mono text-xs sm:text-sm flex items-center gap-1.5 break-all">
                          {p.loginPortal}
                          <button onClick={(e) => { e.stopPropagation(); copyToClipboard(p.loginPortal, 'login'); }} className="text-muted-foreground hover:text-foreground shrink-0">
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <div className="text-xs text-muted-foreground mb-0.5">Haslo portalu</div>
                        <div className="font-mono flex items-center gap-1.5">
                          <span className="text-sm">{passVisible ? p.haslo : '********'}</span>
                          <button onClick={(e) => { e.stopPropagation(); togglePassword(p.id); }} className="text-muted-foreground hover:text-foreground">
                            {passVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); copyToClipboard(p.haslo, 'haslo'); }} className="text-muted-foreground hover:text-foreground">
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {p.notatki && (
                        <div className="col-span-full">
                          <div className="text-xs text-muted-foreground mb-0.5">Notatki</div>
                          <div className="text-sm">{p.notatki}</div>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openEdit(p); }}>
                        <Edit2 className="mr-1 h-3 w-3" /> Edytuj
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}>
                        <Trash2 className="mr-1 h-3 w-3" /> Usun
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) closeForm(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto mx-2 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edytuj uczestnika" : "Nowy uczestnik"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Dane osobowe</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label>Imie *</Label>
                  <Input value={formData.imie || ''} onChange={e => setFormData({...formData, imie: e.target.value})} placeholder="np. Karolina" />
                </div>
                <div className="space-y-2">
                  <Label>Nazwisko *</Label>
                  <Input value={formData.nazwisko || ''} onChange={e => setFormData({...formData, nazwisko: e.target.value})} placeholder="np. Czubinska" />
                </div>
                <div className="space-y-2">
                  <Label>PESEL *</Label>
                  <Input value={formData.pesel || ''} onChange={e => setFormData({...formData, pesel: e.target.value})} placeholder="11 cyfr" maxLength={11} className="font-mono" />
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input type="email" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="email@gmail.com" />
                </div>
                <div className="space-y-2">
                  <Label>Telefon *</Label>
                  <Input value={formData.telefon || ''} onChange={e => setFormData({...formData, telefon: e.target.value})} placeholder="np. 515316371" />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Adres</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="space-y-2 sm:col-span-3">
                  <Label>Ulica i numer *</Label>
                  <Input value={formData.adres || ''} onChange={e => setFormData({...formData, adres: e.target.value})} placeholder="np. ul. Prochnika 23 m 35" />
                </div>
                <div className="space-y-2">
                  <Label>Kod pocztowy *</Label>
                  <Input value={formData.kodPocztowy || ''} onChange={e => setFormData({...formData, kodPocztowy: e.target.value})} placeholder="np. 90-708" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Miasto *</Label>
                  <Input value={formData.miasto || ''} onChange={e => setFormData({...formData, miasto: e.target.value})} placeholder="np. Lodz" />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Dostep do portalu</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label>Login portalu *</Label>
                  <Input value={formData.loginPortal || ''} onChange={e => setFormData({...formData, loginPortal: e.target.value})} placeholder="email lub login" className="font-mono" />
                </div>
                <div className="space-y-2">
                  <Label>Haslo portalu *</Label>
                  <Input value={formData.haslo || ''} onChange={e => setFormData({...formData, haslo: e.target.value})} placeholder="haslo do portalu" className="font-mono" />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Dodatkowe</h3>
              <div className="space-y-2">
                <Label>Notatki</Label>
                <Textarea value={formData.notatki || ''} onChange={e => setFormData({...formData, notatki: e.target.value})} placeholder="Dodatkowe informacje o uczestniku..." rows={3} />
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={closeForm} className="w-full sm:w-auto">Anuluj</Button>
            <Button onClick={handleSave} disabled={createParticipant.isPending || updateParticipant.isPending} className="w-full sm:w-auto">
              {editingId ? "Zapisz zmiany" : "Dodaj uczestnika"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
