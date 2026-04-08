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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit2, Trash2, CheckCircle2, XCircle, Eye, EyeOff, ChevronDown, ChevronUp, Copy, X } from "lucide-react";
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Uczestnicy</h1>
          <p className="text-muted-foreground">Pelny podglad i edycja danych uczestnikow procesu rekrutacyjnego.</p>
        </div>
        <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" /> Dodaj uczestnika</Button>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-8"></TableHead>
              <TableHead>Imie i nazwisko</TableHead>
              <TableHead>Kontakt</TableHead>
              <TableHead>Miasto</TableHead>
              <TableHead>PESEL</TableHead>
              <TableHead>Login portalu</TableHead>
              <TableHead>Haslo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Akcje</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center h-24">Ladowanie...</TableCell></TableRow>
            ) : participants?.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center h-24">Brak uczestnikow</TableCell></TableRow>
            ) : participants?.map((p: any) => {
              const isExpanded = expandedId === p.id;
              const passVisible = showPasswords[p.id];
              return (
                <React.Fragment key={p.id}>
                  <TableRow className={`cursor-pointer hover:bg-muted/40 transition-colors ${isExpanded ? 'bg-muted/20 border-b-0' : ''}`}>
                    <TableCell className="px-2" onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="font-medium" onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                      {p.imie} {p.nazwisko}
                    </TableCell>
                    <TableCell onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                      <div className="text-sm">{p.email}</div>
                      <div className="text-xs text-muted-foreground">{p.telefon}</div>
                    </TableCell>
                    <TableCell onClick={() => setExpandedId(isExpanded ? null : p.id)}>{p.miasto}</TableCell>
                    <TableCell className="font-mono text-sm" onClick={() => setExpandedId(isExpanded ? null : p.id)}>{p.pesel}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-mono truncate max-w-[180px]">{p.loginPortal}</span>
                        <button onClick={() => copyToClipboard(p.loginPortal, 'login')} className="text-muted-foreground hover:text-foreground">
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-mono">{passVisible ? p.haslo : '********'}</span>
                        <button onClick={() => togglePassword(p.id)} className="text-muted-foreground hover:text-foreground">
                          {passVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </button>
                        <button onClick={() => copyToClipboard(p.haslo, 'haslo')} className="text-muted-foreground hover:text-foreground">
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </TableCell>
                    <TableCell onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                      {p.validationStatus === 'ok' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle2 className="mr-1 h-3 w-3" /> OK</span>
                      ) : p.validationStatus === 'error' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><XCircle className="mr-1 h-3 w-3" /> Blad</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Nie sprawdzono</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Edit2 className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(p.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="bg-muted/10 hover:bg-muted/10">
                      <TableCell colSpan={9} className="p-0">
                        <div className="px-6 py-4 border-t border-dashed">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Imie</div>
                              <div className="font-medium">{p.imie}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Nazwisko</div>
                              <div className="font-medium">{p.nazwisko}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">PESEL</div>
                              <div className="font-mono">{p.pesel}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Email</div>
                              <div className="font-mono text-sm">{p.email}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Telefon</div>
                              <div>{p.telefon}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Adres</div>
                              <div>{p.adres}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Kod pocztowy</div>
                              <div>{p.kodPocztowy}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Miasto</div>
                              <div>{p.miasto}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Login portalu</div>
                              <div className="font-mono text-sm flex items-center gap-1">
                                {p.loginPortal}
                                <button onClick={() => copyToClipboard(p.loginPortal, 'login')} className="text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" /></button>
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Haslo portalu</div>
                              <div className="font-mono flex items-center gap-1">
                                {passVisible ? p.haslo : '********'}
                                <button onClick={() => togglePassword(p.id)} className="text-muted-foreground hover:text-foreground">
                                  {passVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                </button>
                                <button onClick={() => copyToClipboard(p.haslo, 'haslo')} className="text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" /></button>
                              </div>
                            </div>
                            <div className="col-span-2">
                              <div className="text-xs text-muted-foreground mb-1">Notatki</div>
                              <div className="text-sm">{p.notatki || '—'}</div>
                            </div>
                          </div>
                          <div className="mt-4 flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                              <Edit2 className="mr-1 h-3 w-3" /> Edytuj dane
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) closeForm(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edytuj uczestnika" : "Nowy uczestnik"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Dane osobowe</h3>
              <div className="grid grid-cols-2 gap-4">
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
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2 col-span-3">
                  <Label>Ulica i numer *</Label>
                  <Input value={formData.adres || ''} onChange={e => setFormData({...formData, adres: e.target.value})} placeholder="np. ul. Prochnika 23 m 35" />
                </div>
                <div className="space-y-2">
                  <Label>Kod pocztowy *</Label>
                  <Input value={formData.kodPocztowy || ''} onChange={e => setFormData({...formData, kodPocztowy: e.target.value})} placeholder="np. 90-708" />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Miasto *</Label>
                  <Input value={formData.miasto || ''} onChange={e => setFormData({...formData, miasto: e.target.value})} placeholder="np. Lodz" />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Dostep do portalu</h3>
              <div className="grid grid-cols-2 gap-4">
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
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Anuluj</Button>
            <Button onClick={handleSave} disabled={createParticipant.isPending || updateParticipant.isPending}>
              {editingId ? "Zapisz zmiany" : "Dodaj uczestnika"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
