import { Providers } from "@/client/shared/Providers";
import { ErrorScreen, Splash } from "@/client/shared/Screens";
import { trpc } from "@/client/shared/trpc";
import { HostShell } from "./HostShell";
import { Login } from "./Login";

export function App() {
  return (
    <Providers>
      <AdminRoot />
    </Providers>
  );
}

function AdminRoot() {
  const me = trpc.me.useQuery();
  if (me.isPending) return <Splash />;
  if (me.error) return <ErrorScreen message="Сервер недоступен" onRetry={() => me.refetch()} />;
  if (!me.data.isHost) return <Login />;
  return <HostShell userName={me.data.user?.name ?? ""} />;
}
