// apps/web/src/routes/LoginPage.tsx
import { Alert, Button, Input } from "@lurem/ui";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { ApiError, loginWithGoogle } from "../auth/api-client";
import { useGoogleIdentityButton } from "../auth/useGoogleIdentityButton";

export function describeAuthError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "auth.invalid_credentials") {
      return "E-mail ou senha incorretos.";
    }
    if (error.code === "auth.rate_limited") {
      return "Muitas tentativas. Tente de novo em alguns minutos.";
    }
    return error.message;
  }
  return "Não foi possível conectar. Tente novamente.";
}

export function LoginPage() {
  const { login, adoptSession } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleGoogleCredential(credential: string) {
    setFormError(null);
    setSubmitting(true);
    try {
      const accessToken = await loginWithGoogle(credential);
      await adoptSession(accessToken);
      // Timeline is the real home (§6.12) — same destination as the
      // e-mail/password flow below.
      await navigate({ to: "/timeline" });
    } catch (error) {
      setFormError(describeAuthError(error));
    } finally {
      setSubmitting(false);
    }
  }
  const { buttonRef: googleButtonRef, available: googleAvailable } =
    useGoogleIdentityButton(handleGoogleCredential);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await login(email, password);
      // Timeline is the real home (§6.12) — both the activation surface
      // when empty and the financial history when full; not /accounts.
      await navigate({ to: "/timeline" });
    } catch (error) {
      if (error instanceof ApiError && error.details?.length) {
        const next: Record<string, string> = {};
        for (const detail of error.details) {
          next[detail.field] = detail.message;
        }
        setFieldErrors(next);
      } else {
        setFormError(describeAuthError(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-xl font-bold text-[var(--lr-text)]">
        Entrar no Lurem
      </h1>
      {googleAvailable ? (
        <>
          <div ref={googleButtonRef} className="flex justify-center" />
          <div className="flex items-center gap-3">
            <hr className="flex-1 border-[var(--lr-border)]" />
            <span className="text-sm text-[var(--lr-text-secondary)]">ou</span>
            <hr className="flex-1 border-[var(--lr-border)]" />
          </div>
        </>
      ) : null}
      <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
        <Input
          type="email"
          label="E-mail"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fieldErrors.email}
          required
          autoComplete="email"
        />
        <Input
          type="password"
          label="Senha"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
          required
          autoComplete="current-password"
        />
        {formError ? (
          <Alert variant="error" layout="inline" title={formError} />
        ) : null}
        <Button type="submit" loading={submitting}>
          Entrar
        </Button>
      </form>
    </div>
  );
}
