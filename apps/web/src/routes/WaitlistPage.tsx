// apps/web/src/routes/WaitlistPage.tsx
// BACKLOG.md US-8.1 — fila de acesso pública. A landing "de verdade" com
// composição própria pertence ao Épico 10 (ARQUITETURA.md §6.0), ainda fora
// deste ciclo. Esta versão soma identidade e posicionamento reais (logo,
// manifesto de BRAND.md, os três princípios vinculantes de PRODUCT.md) ao
// formulário mínimo já existente — não é a landing completa (sem imagery,
// sem seções extras), só deixa de ser um formulário anônimo. Mover/expandir
// para a landing quando ela for construída.
import { Alert, Button, Input } from "@lurem/ui";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ApiError, apiFetchJson } from "../auth/api-client";

const PRINCIPLES = [
  {
    title: "Clareza, não tempo de uso",
    body: "Sucesso é você entender sua realidade financeira rápido e voltar para a sua vida — não permanecer no app.",
  },
  {
    title: "Nunca confundimos estimativa com certeza",
    body: "Todo número calculado mostra de onde veio. Dado estimado e dado confirmado nunca têm a mesma cor.",
  },
  {
    title: "Seus dados nunca saem do seu controle",
    body: "Extratos e faturas são lidos no seu navegador — o arquivo nunca sai do seu dispositivo.",
  },
];

function BrandPanel() {
  return (
    <div className="flex flex-col justify-center gap-8 bg-[#090F1A] px-8 py-12 text-[var(--lr-ivory-100)] md:w-1/2 md:px-16">
      <img src="/logo.svg" alt="Lurem" className="w-32" />
      <div>
        <p className="text-2xl leading-snug font-bold">
          A direção começa com clareza.
        </p>
        <p className="mt-4 max-w-sm text-[.9375rem] text-[var(--lr-night-300)]">
          Lurem existe para responder, com números confiáveis e explicáveis, a
          única pergunta que importa: quanto dinheiro você realmente pode gastar
          hoje.
        </p>
      </div>
      <ul className="flex flex-col gap-5">
        {PRINCIPLES.map((p) => (
          <li
            key={p.title}
            className="border-t border-[var(--lr-night-700)] pt-4"
          >
            <p className="text-sm font-semibold">{p.title}</p>
            <p className="mt-1 text-[.8125rem] text-[var(--lr-night-300)]">
              {p.body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WaitlistPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // Honeypot — invisível via CSS, não com display:none (leitores de tela e
  // alguns bots ignoram display:none); um humano nunca vê nem preenche.
  const [website, setWebsite] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiFetchJson("/access/waitlist", {
        method: "POST",
        body: JSON.stringify({ name, email, website: website || undefined }),
      });
      setSubmitted(true);
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Não foi possível enviar. Tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <BrandPanel />
      <div className="flex flex-col justify-center gap-6 px-4 py-12 md:w-1/2 md:px-16">
        <div className="mx-auto w-full max-w-sm">
          {submitted ? (
            <Alert
              variant="success"
              title="Você está na fila"
              description="Avisaremos por e-mail quando seu acesso for liberado."
            />
          ) : (
            <>
              <h1 className="text-xl font-bold text-[var(--lr-text)]">
                Pedir acesso ao Lurem
              </h1>
              <p className="mt-2 mb-6 text-[.9375rem] text-[var(--lr-text-secondary)]">
                O acesso está fechado por enquanto. Entre na fila e avisamos por
                e-mail assim que liberar.
              </p>
              <form className="grid gap-4" onSubmit={onSubmit} noValidate>
                <Input
                  label="Nome"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
                <Input
                  type="email"
                  label="E-mail"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                <div className="absolute -left-[9999px]" aria-hidden="true">
                  <label htmlFor="website">Deixe em branco</label>
                  <input
                    id="website"
                    name="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(event) => setWebsite(event.target.value)}
                  />
                </div>
                {formError ? (
                  <Alert variant="error" layout="inline" title={formError} />
                ) : null}
                <Button type="submit" loading={submitting}>
                  Entrar na fila
                </Button>
              </form>
              <p className="mt-6 text-[.8125rem] text-[var(--lr-text-secondary)]">
                Já tem conta?{" "}
                <Link
                  to="/login"
                  className="text-[var(--lr-graphite-700)] hover:underline"
                >
                  Entrar
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
