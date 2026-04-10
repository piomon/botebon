import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, User, AlertCircle } from "lucide-react";

interface LoginProps {
  onLogin: () => void;
}

const ADMIN_EMAIL = "admin";
const ADMIN_PASSWORD = "admin";

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    setTimeout(() => {
      if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        sessionStorage.setItem("ebon_auth", "1");
        onLogin();
      } else {
        setError("Nieprawidlowy email lub haslo.");
      }
      setLoading(false);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f1b2d] via-[#1a2d4a] to-[#0f1b2d] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white/10 backdrop-blur rounded-2xl mx-auto mb-4 flex items-center justify-center border border-white/20">
            <Lock className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">EBON Panel</h1>
          <p className="text-sm text-white/50 mt-1">Panel koordynatora — dostep chroniony</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-6 space-y-5">
          <div className="space-y-2">
            <Label className="text-white/70 text-sm">Login</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
              <Input
                type="text"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Wpisz login..."
                className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-white/30"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-white/70 text-sm">Haslo</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Wpisz haslo..."
                className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-white/30"
                required
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20"
          >
            {loading ? "Logowanie..." : "Zaloguj sie"}
          </Button>
        </form>

        <p className="text-center text-white/20 text-xs mt-6">
          Dane wrazliwe — dostep tylko dla upowaznionych osob
        </p>
      </div>
    </div>
  );
}
