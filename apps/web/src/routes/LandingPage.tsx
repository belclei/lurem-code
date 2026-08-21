// apps/web/src/routes/LandingPage.tsx
//
// DIRECTION CONTRACT (impeccable new-work §5) — concept-seed surface roll,
// key d82aac32, assigned index 4 of 7, fused with the before/after-sweep
// staging challenger as the opening demonstration.
//
// THESIS: A landing page is usually a pitch about a product. This one is a
// demonstration of the product's one differentiator — the visitor watches
// confusion resolve into one clear number before reading a sentence of
// copy. Refuses the category-default headline+screenshot+logo-wall.
//
// OWN-WORLD: full-bleed night-900 as the "night" the lighthouse operates
// in; ivory-100 appears only where clarity has already landed (the
// resolved hero number, the waitlist form). Michroma wordmark, gold-500 as
// the single light source, petrol-700 for confirmed/stable — same tokens
// DESIGN.md already commits to, no new palette. Hard cut between night and
// ivory sections, never a gradient blend (DESIGN.md forbids gradients).
//
// STORY: visitor believes "this app doesn't just show numbers, it tells me
// which ones I can trust" and acts by joining the waitlist, already primed
// by having watched the mechanism work.
//
// FIRST VIEWPORT: dark field, wordmark top-left. A cluster of illegible,
// overlapping estimated figures (labeled synthetic) sweeps into one
// resolved hero number under gold light via a draggable range control —
// the before/after sweep fused as the opening demonstration. CTA visible
// without scrolling.
//
// FORM: Farol Wayfinding scroll — light passes over each product principle
// in sequence as the visitor scrolls, ending at the form as "safe harbor".
import { Alert, Button, Input, Mono } from "@lurem/ui";
import { Link, Navigate } from "@tanstack/react-router";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "../auth/AuthContext";
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

// Sequential "light passes over" reveal — reuses .lr-reveal (already defined
// in lurem-tokens.css, honors prefers-reduced-motion globally) instead of a
// bespoke animation, fired once per element as it enters the viewport.
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, revealed };
}

function Reveal({ children }: { children: ReactNode }) {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={revealed ? "lr-reveal" : "opacity-0"}>
      {children}
    </div>
  );
}

// The opening demonstration: a cluster of overlapping, illegible "estimate"
// figures sweeps into one resolved hero number as the visitor drags the
// control. Fuses the before/after-sweep staging challenger into the
// committed identity via a single clip-path custom property — no canvas,
// no WebGL, no new palette. Data is illustrative and labeled as such.
function ClaritySweep() {
  const [sweep, setSweep] = useState(28);

  return (
    <div className="mt-10 w-full max-w-2xl">
      <div className="relative h-40 overflow-hidden rounded-[var(--lr-r-lg)] border border-[var(--lr-night-700)] bg-[var(--lr-night-800)] sm:h-48">
        {/* "Confuso" layer — always present underneath */}
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center gap-4 px-6"
        >
          <Mono
            variant="number"
            tone="estimate"
            className="rotate-[-6deg] text-[1.25rem] opacity-70"
          >
            R$ 1.284,00
          </Mono>
          <Mono
            variant="number"
            tone="estimate"
            className="mt-6 rotate-[4deg] text-[1rem] opacity-60"
          >
            ≈ R$ 340,00
          </Mono>
          <Mono
            variant="number"
            tone="estimate"
            className="rotate-[-3deg] text-[1.5rem] opacity-80"
          >
            R$ -820,50
          </Mono>
          <Mono
            variant="number"
            tone="estimate"
            className="mt-4 rotate-[7deg] text-[1.125rem] opacity-50"
          >
            R$ 2.100,00
          </Mono>
        </div>
        {/* "Claro" layer — revealed left-to-right by the sweep control */}
        <div
          className="absolute inset-0 flex items-center justify-center bg-[var(--lr-night-900)]"
          style={{ clipPath: `inset(0 ${100 - sweep}% 0 0)` }}
        >
          <div className="flex flex-none flex-col items-center px-8">
            {/* Gold marks the light/attention on the label and rule, never
                the money value itself — DESIGN.md's Never-Wealth Rule has
                no demo-context exception ("se um valor monetário está em
                dourado, é um bug de significado, não de estilo"). */}
            <span className="lr-label text-[var(--lr-gold-500)]">
              DISPONÍVEL HOJE
            </span>
            <Mono
              variant="number"
              // `!` (Tailwind v4 important-modifier) is required: .lr-money
              // sets color as an unlayered rule (lurem-tokens.css), which
              // always wins over a Tailwind arbitrary-value utility
              // regardless of source order — same class of bug already
              // fixed on Card.tsx/Alert.tsx. Without it this rendered
              // --lr-text (night-900) on a night-900 background: invisible.
              className="lr-money--hero mt-1 text-[var(--lr-ivory-100)]!"
            >
              R$ 1.847,32
            </Mono>
            <span className="mt-2 h-px w-16 bg-[var(--lr-gold-500)]" />
          </div>
        </div>
      </div>
      <label className="mt-4 flex flex-col gap-1.5" htmlFor="clarity-sweep">
        <span className="text-[.8125rem] text-[var(--lr-night-300)]">
          Arraste para ver a clareza chegar
        </span>
        <input
          id="clarity-sweep"
          type="range"
          min={0}
          max={100}
          value={sweep}
          onChange={(event) => setSweep(Number(event.target.value))}
          className="w-full accent-[var(--lr-gold-500)]"
        />
      </label>
      <p className="mt-2 text-[.75rem] text-[var(--lr-night-500)]">
        Dados ilustrativos — não é a sua conta real.
      </p>
    </div>
  );
}

function WaitlistForm() {
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

  if (submitted) {
    return (
      <Alert
        variant="success"
        title="Você está na fila"
        description="Avisaremos por e-mail quando seu acesso for liberado."
      />
    );
  }

  return (
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
  );
}

/** Route entry for "/" — logged-in visitors go straight to the app, only a
 * logged-out visitor sees the landing. */
export function IndexPage() {
  const { isBooting, user } = useAuth();
  if (isBooting) {
    return <p className="p-6 text-[var(--lr-text-secondary)]">Carregando…</p>;
  }
  if (user) {
    return <Navigate to="/timeline" />;
  }
  return <LandingPage />;
}

function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-4 sm:px-10">
        <img src="/logo.svg" alt="Lurem" className="h-8" />
        <Link
          to="/login"
          className="text-[.8125rem] text-[var(--lr-night-300)] hover:text-[var(--lr-ivory-100)] hover:underline"
        >
          Já tem conta? Entrar
        </Link>
      </header>

      {/* Section 1 — the opening demonstration leads; copy explains what
          just happened, it doesn't precede it. Night field, full viewport. */}
      <section className="flex min-h-screen flex-col items-center justify-center bg-[#090F1A] px-6 pt-24 pb-16 text-center text-[var(--lr-ivory-100)] sm:px-10">
        <ClaritySweep />
        <p className="mt-10 max-w-xl text-3xl leading-snug font-bold sm:text-4xl">
          A direção começa com clareza.
        </p>
        <p className="mt-4 max-w-md text-[.9375rem] text-[var(--lr-night-300)]">
          Lurem existe para responder, com números confiáveis e explicáveis, a
          única pergunta que importa: quanto dinheiro você realmente pode gastar
          hoje.
        </p>
        <a
          href="#fila"
          className="mt-10 text-[.8125rem] text-[var(--lr-night-300)] hover:text-[var(--lr-ivory-100)] hover:underline"
        >
          Entrar na fila de espera ↓
        </a>
      </section>

      {/* Sections 2–4 — the light passes over each principle in sequence. */}
      <section className="flex flex-col gap-24 bg-[#090F1A] px-6 py-24 text-[var(--lr-ivory-100)] sm:px-10">
        {PRINCIPLES.map((p) => (
          <Reveal key={p.title}>
            <div className="mx-auto max-w-lg text-center">
              {/* The light itself, not a section divider — a point, not a
                  line, so each principle reads as somewhere the beam
                  stopped rather than a generic card border. */}
              <span
                aria-hidden="true"
                className="mx-auto mb-6 block h-2 w-2 rounded-full bg-[var(--lr-gold-500)]"
              />
              <p className="text-xl font-bold sm:text-2xl">{p.title}</p>
              <p className="mt-3 text-[.9375rem] text-[var(--lr-night-300)]">
                {p.body}
              </p>
            </div>
          </Reveal>
        ))}
      </section>

      {/* Section 5 — hard cut to ivory: the surface where clarity has landed. */}
      <section
        id="fila"
        className="flex min-h-screen flex-col items-center justify-center bg-[var(--lr-bg)] px-6 py-24 sm:px-10"
      >
        <Reveal>
          <div className="mx-auto w-full max-w-sm text-center">
            <h1 className="text-xl font-bold text-[var(--lr-text)]">
              Pedir acesso ao Lurem
            </h1>
            <p className="mt-2 mb-6 text-[.9375rem] text-[var(--lr-text-secondary)]">
              O acesso está fechado por enquanto. Entre na fila e avisamos por
              e-mail assim que liberar.
            </p>
            <div className="text-left">
              <WaitlistForm />
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
