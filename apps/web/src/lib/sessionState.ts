// apps/web/src/lib/sessionState.ts
// issues.md: filtros da Timeline (período, categorias, chips de tipo/conta
// escondidos) devem sobreviver a navegar pra outra tela e voltar — só devem
// voltar ao padrão quando o usuário recarrega o sistema de verdade (F5/nova
// aba). sessionStorage é o mecanismo certo pra isso: persiste entre
// remounts de componente (troca de rota dentro do SPA) e sobrevive a um
// refresh de página, mas some quando a aba/janela fecha — não é
// "permanente" como localStorage, é só "durante esta sessão do navegador".
import { useEffect, useState } from "react";

/** useState que espelha o valor em sessionStorage sob `key`, usando
 * `serialize`/`deserialize` pra lidar com tipos que `JSON.stringify` não
 * reconstrói sozinho (Set, Date). Falha silenciosa (sessionStorage
 * indisponível, JSON inválido) sempre cai de volta pro valor inicial —
 * nunca deixa a Timeline inutilizável por causa disso. */
export function useSessionState<T>(
  key: string,
  initial: () => T,
  serialize: (value: T) => string,
  deserialize: (raw: string) => T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw !== null) return deserialize(raw);
    } catch {
      // sessionStorage indisponível (modo privado, SSR, etc.) — segue com o padrão.
    }
    return initial();
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, serialize(state));
    } catch {
      // Idem — persistir é um extra, nunca deve quebrar a tela.
    }
  }, [key, serialize, state]);

  return [state, setState];
}

export function serializeStringSet(value: Set<string>): string {
  return JSON.stringify([...value]);
}
export function deserializeStringSet(raw: string): Set<string> {
  return new Set(JSON.parse(raw) as string[]);
}

export function serializeDateRange(value: {
  from?: Date;
  to?: Date;
}): string {
  return JSON.stringify({
    from: value.from ? value.from.toISOString() : undefined,
    to: value.to ? value.to.toISOString() : undefined,
  });
}
export function deserializeDateRange(raw: string): {
  from?: Date;
  to?: Date;
} {
  const parsed = JSON.parse(raw) as { from?: string; to?: string };
  return {
    from: parsed.from ? new Date(parsed.from) : undefined,
    to: parsed.to ? new Date(parsed.to) : undefined,
  };
}

export function serializeDate(value: Date): string {
  return value.toISOString();
}
export function deserializeDate(raw: string): Date {
  return new Date(raw);
}

export function serializeNullableString(value: string | null): string {
  return JSON.stringify(value);
}
export function deserializeNullableString(raw: string): string | null {
  return JSON.parse(raw) as string | null;
}
