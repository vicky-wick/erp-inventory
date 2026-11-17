import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { post, setToken } from "@/lib/api";
import { useSession } from "@/providers/session";
import { Button } from "@/components/ui/button";
import { Input, Field, FieldError } from "@/components/ui/input";
import type { AuthUser, WorkspaceSummary } from "@/types";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { refreshMe } = useSession();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password");
      return;
    }
    setLoading(true);
    try {
      const data = await post<{ user: AuthUser; token: string }>("/auth/login", { email, password });
      setToken(data.token);
      await refreshMe();
      navigate("/app/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-5 shadow-sm">
      <h2 className="text-base font-semibold">Welcome back</h2>
      <p className="mb-4 mt-0.5 text-xs text-muted-foreground">Sign in to manage your shop</p>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email">
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            invalid={!!error}
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            invalid={!!error}
          />
        </Field>
        <FieldError message={error} />
        <Button type="submit" loading={loading} className="w-full" size="lg">
          Sign in
        </Button>
      </form>
      <div className="mt-4 flex justify-between text-xs">
        <Link to="/forgot-password" className="text-muted-foreground hover:text-accent">
          Forgot password?
        </Link>
        <Link to="/register" className="font-medium text-accent hover:opacity-80">
          Create account
        </Link>
      </div>
    </div>
  );
}
