// apps/api/src/email/render-template.ts
// Nenhum motor de template existe no projeto — 2 e-mails não justificam
// trazer Handlebars/EJS/etc (YAGNI). Substituição por regex é suficiente:
// sem loops/condicionais nos templates.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "templates",
);

// Vars here are user-supplied names (invite/connection/reset flows) — escape
// on HTML render so a name like `<b>` can't inject markup into the email.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function substituteVars(
  template: string,
  vars: Record<string, string>,
  escapeValues = false,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = vars[key] ?? "";
    return escapeValues ? escapeHtml(value) : value;
  });
}

export function renderTemplate(
  fileName: string,
  vars: Record<string, string>,
): string {
  const raw = readFileSync(join(TEMPLATES_DIR, fileName), "utf-8");
  return substituteVars(raw, vars, fileName.endsWith(".html"));
}
