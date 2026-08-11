// apps/web/src/routes/ForgotPasswordPage.tsx
// "Esqueci minha senha" (§6.1 emenda 10/08/2026) — só pede o e-mail e
// sempre mostra a mesma mensagem de sucesso genérica, espelhando a
// proteção contra enumeração de contas que a API já aplica em
// POST /v1/auth/forgot-password (nunca revela se o e-mail existe).
import { Alert, Button, Input } from "@lurem/ui";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { forgotPassword } from "../auth/api-client";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await forgotPassword(email);
    } finally {
      // Mesmo se a chamada falhar por rede/erro inesperado, não há nada
      // mais específico e seguro pra mostrar do que a mensagem genérica —
      // qualquer detalhe extra arrisca vazar se o e-mail existe ou não.
      setSubmitted(true);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-xl font-bold text-[var(--lr-text)]">
        Esqueci minha senha
      </h1>
      {submitted ? (
        <Alert
          variant="success"
          title="Verifique seu e-mail"
          description="Se este e-mail tiver uma conta no Lurem, enviamos um link para redefinir a senha."
        />
      ) : (
        <form className="grid gap-4" onSubmit={onSubmit} noValidate>
          <p className="text-sm text-[var(--lr-text-secondary)]">
            Informe o e-mail da sua conta e enviaremos um link para redefinir
            sua senha.
          </p>
          <Input
            type="email"
            label="E-mail"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
          <Button type="submit" loading={submitting}>
            Enviar link
          </Button>
        </form>
      )}
      <Link
        to="/login"
        className="text-center text-sm text-[var(--lr-text-secondary)] underline"
      >
        Voltar para o login
      </Link>
    </div>
  );
}
