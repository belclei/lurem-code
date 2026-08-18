// apps/api/src/email/templates.ts
import type { Resend } from "resend";
import { renderTemplate } from "./render-template.js";

async function send(
  resend: Resend,
  params: { to: string; subject: string; html: string; text: string },
): Promise<{ id: string }> {
  const { data, error } = await resend.emails.send({
    from: "Lurem <onboarding@lurem.fasolo.tech>",
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
  if (error || !data) {
    throw new Error(`Resend send failed: ${error?.message ?? "unknown error"}`);
  }
  return { id: data.id };
}

// inviterName só existe no fluxo de convite usuário-a-usuário (invites/routes.ts,
// aprovado via admin/routes.ts) — a fila de espera (waitlist) é auto-cadastro,
// sem convidante. O motor de template (render-template.ts) não suporta
// condicionais, então a frase de abertura é montada aqui, não no arquivo.
export function sendInviteEmail(
  resend: Resend,
  params: {
    to: string;
    link: string;
    inviteeName: string;
    inviterName?: string;
  },
): Promise<{ id: string }> {
  const introText = params.inviterName
    ? `${params.inviterName} te convidou para o Lurem.`
    : "Você entrou na fila de espera e agora tem acesso ao Lurem.";
  const vars = {
    link: params.link,
    inviteeName: params.inviteeName,
    introText,
  };
  return send(resend, {
    to: params.to,
    subject: params.inviterName
      ? `${params.inviterName} te convidou para o Lurem`
      : "Seu convite para o Lurem chegou",
    html: renderTemplate("lurem-convite.html", vars),
    text: renderTemplate("lurem-convite.txt", vars),
  });
}

export function sendPasswordResetEmail(
  resend: Resend,
  params: { to: string; link: string; userName: string },
): Promise<{ id: string }> {
  const vars = { link: params.link, userName: params.userName };
  return send(resend, {
    to: params.to,
    subject: "Defina sua senha no Lurem",
    html: renderTemplate("lurem-reset-senha.html", vars),
    text: renderTemplate("lurem-reset-senha.txt", vars),
  });
}

export function sendConnectionRequestEmail(
  resend: Resend,
  params: {
    to: string;
    requesterName: string;
    link: string;
    addresseeName: string;
  },
): Promise<{ id: string }> {
  const vars = {
    requesterName: params.requesterName,
    addresseeName: params.addresseeName,
    link: params.link,
  };
  return send(resend, {
    to: params.to,
    subject: `${params.requesterName} quer se conectar com você no Lurem`,
    html: renderTemplate("lurem-conexao.html", vars),
    text: renderTemplate("lurem-conexao.txt", vars),
  });
}
