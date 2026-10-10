import { LogIn } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/client/shared/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function Login() {
  const [busy, setBusy] = useState(false);
  const signIn = async () => {
    setBusy(true);
    const res = await authClient.signIn.social({ provider: "sso", callbackURL: "/admin" });
    if (res.error) {
      toast.error(res.error.message ?? "Не удалось начать вход");
      setBusy(false);
    }
  };
  return (
    <div className="party-bg flex h-full items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Party Quiz 🎉</CardTitle>
          <CardDescription>Панель ведущего. Войди, чтобы управлять викторинами.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button size="lg" onClick={signIn} disabled={busy}>
            <LogIn /> Войти через SSO
          </Button>
          {location.hostname === "localhost" && (
            <Button variant="link" asChild>
              <a href="/api/dev/host-login">Dev-вход (AUTH_DEV_BYPASS=1)</a>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
