import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "./components/layout";
import Login from "./pages/login";

import Dashboard from "./pages/dashboard";
import Participants from "./pages/participants";
import Validation from "./pages/validation";
import Plan from "./pages/plan";
import Simulation from "./pages/simulation";
import Settings from "./pages/settings";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/uczestnicy" component={Participants} />
      <Route path="/walidacja" component={Validation} />
      <Route path="/plan" component={Plan} />
      <Route path="/symulacja" component={Simulation} />
      <Route path="/ustawienia" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [authenticated, setAuthenticated] = useState(
    () => sessionStorage.getItem("ebon_auth") === "1"
  );

  if (!authenticated) {
    return (
      <>
        <Login onLogin={() => setAuthenticated(true)} />
        <Toaster />
      </>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Layout onLogout={() => { sessionStorage.removeItem("ebon_auth"); setAuthenticated(false); }}>
            <Router />
          </Layout>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
