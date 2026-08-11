// apps/web/src/routes/ResetPasswordPage.tsx
// "Esqueci minha senha" (§6.1 emenda 10/08/2026) — lê `?token=` da URL
// (link enviado por e-mail, POST /v1/auth/forgot-password) e troca a senha
// via POST /v1/auth/reset-password. Mesma validação de confirmação e mesmo
// mínimo de 8 caracteres do formulário de cadastro (RegisterPage).
import { Alert, Button, Input } from "@lurem/ui";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ApiError, resetPassword } from "../auth/api-client";

function tokenFromUrl(): string {
  return new URLSearchParams(window.location.search).get("token") ?? "";
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [token] = useState(tokenFromUrl);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!token) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
        <Alert
          variant="error"
          title="Link incompleto"
          description="Este link de redefinição não tem um token. Peça um novo na página de login."
        />
      </div>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (newPassword !== confirmPassword) {
      setFormError("A confirmação não bate com a senha.");
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(token, newPassword);
      await navigate({ to: "/login" });
    } catch (error) {
      // auth.token_invalid / auth.token_expired já vêm com mensagens claras
      // do catálogo de erros (errors.ts) — sem detalhar mais que isso aqui.
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Não foi possível redefinir sua senha. Tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-xl font-bold text-[var(--lr-text)]">
        Escolher nova senha
      </h1>
      <form className="grid gap-4" onSubmit={onSubmit} noValidate>
        <Input
          type="password"
          label="Nova senha"
          hint="Mínimo de 8 caracteres."
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          required
          autoComplete="new-password"
        />
        <Input
          type="password"
          label="Confirmar nova senha"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          autoComplete="new-password"
        />
        {formError ? (
          <Alert variant="error" layout="inline" title={formError} />
        ) : null}
        <Button type="submit" loading={submitting}>
          Redefinir senha
        </Button>
      </form>
    </div>
  );
}
