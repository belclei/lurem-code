// apps/web/src/routes/RegisterPage.tsx
// BACKLOG.md US-8.3 — tela de cadastro via token (fila de acesso ou convite
// aprovados). Pública — sem sessão. E-mail vem travado do token; mostra
// quem convidou quando aplicável (§6.1).
//
// BACKLOG.md §13 "Cadastro via Google na tela /register": a spec sempre
// descreveu "ou Google" como opção aqui, mas só e-mail/senha tinha sido
// construído — a API (POST /v1/auth/google, `token` opcional) já suportava
// isso desde o gate de convite do Sprint 15, só faltava este botão.
import { Alert, Button, DateField, Input } from "@lurem/ui";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiFetchJson, loginWithGoogle } from "../auth/api-client";
import { useGoogleIdentityButton } from "../auth/useGoogleIdentityButton";
import { describeAuthError } from "./LoginPage";

interface RegisterPreview {
  email: string;
  inviterName: string | null;
}

function tokenFromUrl(): string {
  return new URLSearchParams(window.location.search).get("token") ?? "";
}

export function RegisterPage() {
  const { adoptSession } = useAuth();
  const navigate = useNavigate();
  const [token] = useState(tokenFromUrl);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleGoogleCredential(credential: string) {
    setFormError(null);
    setSubmitting(true);
    try {
      const accessToken = await loginWithGoogle(credential, token);
      await adoptSession(accessToken);
      await navigate({ to: "/timeline" });
    } catch (error) {
      setFormError(describeAuthError(error));
    } finally {
      setSubmitting(false);
    }
  }
  const { buttonRef: googleButtonRef, available: googleAvailable } =
    useGoogleIdentityButton(handleGoogleCredential, { text: "signup_with" });

  const previewQuery = useQuery({
    queryKey: ["register-preview", token],
    queryFn: () =>
      apiFetchJson<RegisterPreview>(
        `/auth/register/preview?token=${encodeURIComponent(token)}`,
      ),
    enabled: Boolean(token),
    retry: false,
  });

  if (!token) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
        <Alert
          variant="error"
          title="Link incompleto"
          description="Este link de cadastro não tem um token. Peça um novo na página de acesso."
        />
      </div>
    );
  }

  if (previewQuery.isLoading) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
        <p className="text-[var(--lr-text-secondary)]">Carregando…</p>
      </div>
    );
  }

  if (previewQuery.isError) {
    const error = previewQuery.error;
    const message =
      error instanceof ApiError
        ? error.message
        : "Não foi possível carregar este link.";
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
        <Alert variant="error" title="Link inválido" description={message} />
      </div>
    );
  }

  const preview = previewQuery.data;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (password !== confirmPassword) {
      setFormError("A confirmação não bate com a senha.");
      return;
    }
    setSubmitting(true);
    try {
      const { accessToken } = await apiFetchJson<{ accessToken: string }>(
        "/auth/register",
        {
          method: "POST",
          body: JSON.stringify({ token, name, birthDate, password }),
        },
      );
      await adoptSession(accessToken);
      await navigate({ to: "/timeline" });
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Não foi possível concluir o cadastro.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-xl font-bold text-[var(--lr-text)]">
        Criar sua conta no Lurem
      </h1>
      {preview?.inviterName ? (
        <p className="text-sm text-[var(--lr-text-secondary)]">
          Convite de <strong>{preview.inviterName}</strong>.
        </p>
      ) : null}
      {googleAvailable ? (
        <>
          <div ref={googleButtonRef} className="flex justify-center" />
          <p className="text-center text-xs text-[var(--lr-text-secondary)]">
            Use a conta Google de <strong>{preview?.email}</strong> para que o
            convite seja reconhecido.
          </p>
          <div className="flex items-center gap-3">
            <hr className="flex-1 border-[var(--lr-border)]" />
            <span className="text-sm text-[var(--lr-text-secondary)]">ou</span>
            <hr className="flex-1 border-[var(--lr-border)]" />
          </div>
        </>
      ) : null}
      <form className="grid gap-4" onSubmit={onSubmit} noValidate>
        <Input label="E-mail" value={preview?.email ?? ""} disabled />
        <Input
          label="Nome completo"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <DateField
          label="Data de nascimento"
          value={birthDate}
          onChange={setBirthDate}
          required
        />
        <Input
          type="password"
          label="Senha"
          hint="Mínimo de 8 caracteres."
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="new-password"
        />
        <Input
          type="password"
          label="Confirmar senha"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          autoComplete="new-password"
        />
        {formError ? (
          <Alert variant="error" layout="inline" title={formError} />
        ) : null}
        <Button type="submit" loading={submitting}>
          Criar conta
        </Button>
      </form>
    </div>
  );
}
