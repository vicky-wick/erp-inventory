import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { post, setToken } from "@/lib/api";
import { useSession } from "@/providers/session";
import { Button } from "@/components/ui/button";
import { Input, Field, FieldError } from "@/components/ui/input";
import type { AuthUser } from "@/types";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { refreshMe } = useSession();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return setError("Enter your email");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    setLoading(true);
    try {
      const data = await post<{ user: AuthUser; token: string }>("/auth/register", {
        email, password, name,
      });
      setToken(data.token);
      await refreshMe();
      navigate("/onboarding", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-5 shadow-sm">
      <h2 className="text-base font-semibold">Create your account</h2>
      <p className="mb-4 mt-0.5 text-xs text-muted-foreground">Start managing your shop in minutes</p>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Your name" optional>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Raman" autoComplete="name" />
        </Field>
        <Field label="Email">
          <Input
            type="email" inputMode="email" autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com" invalid={!!error}
          />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <Input
            type="password" autoComplete="new-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••" invalid={!!error}
          />
        </Field>
        <FieldError message={error} />
        <Button type="submit" loading={loading} className="w-full" size="lg">
          Create account
        </Button>
      </form>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-accent hover:opacity-80">
          Sign in
        </Link>
      </p>
    </div>
  );
}
