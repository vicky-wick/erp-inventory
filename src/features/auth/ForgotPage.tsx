import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { post } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Field, FieldError } from "@/components/ui/input";

export default function ForgotPage() {
  const [step, setStep] = useState<"request" | "reset">("request");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function requestReset(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await post<{ ok: boolean; reset_token: string | null }>("/auth/forgot-password", { email });
      if (data.reset_token) {
        // No email service configured in this environment: the token is returned directly.
        setToken(data.reset_token);
        setStep("reset");
      } else {
        setDone(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function doReset(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters");
    setLoading(true);
    try {
      await post("/auth/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-line bg-surface p-5 text-center shadow-sm">
        <h2 className="text-base font-semibold">Password updated</h2>
        <p className="mt-1 text-xs text-muted-foreground">You can now sign in with your new password.</p>
        <Link to="/login" className="mt-4 inline-block rounded-md bg-charcoal px-4 py-2.5 text-sm font-medium text-white">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-5 shadow-sm">
      {step === "request" ? (
        <>
          <h2 className="text-base font-semibold">Forgot password</h2>
          <p className="mb-4 mt-0.5 text-xs text-muted-foreground">
            Enter your account email and we'll create a reset link.
          </p>
          <form onSubmit={requestReset} className="space-y-4">
            <Field label="Email">
              <Input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </Field>
            <FieldError message={error} />
            <Button type="submit" loading={loading} className="w-full" size="lg">Continue</Button>
          </form>
        </>
      ) : (
        <>
          <h2 className="text-base font-semibold">Set a new password</h2>
          <p className="mb-4 mt-0.5 text-xs text-muted-foreground">Choose a password of at least 8 characters.</p>
          <form onSubmit={doReset} className="space-y-4">
            <Field label="New password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </Field>
            <FieldError message={error} />
            <Button type="submit" loading={loading} className="w-full" size="lg">Update password</Button>
          </form>
        </>
      )}
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Remembered it?{" "}
        <Link to="/login" className="font-medium text-accent hover:opacity-80">Sign in</Link>
      </p>
    </div>
  );
}
