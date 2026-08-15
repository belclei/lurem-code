// apps/api/src/imports/bel-ia-client.ts
// §6.8 — gateway LLM compartilhado (mesmo serviço já usado por money-flow e
// bel-ia-client, ver docs/ para o precedente): um único endpoint /v1/chat
// por trás de uma API key + "action" nomeada (a action determina o backend
// real — deepseek/ollama/openai — do lado do bel-ia, esta API não escolhe
// modelo). Ação usada aqui: "pdf-extract", provisionada no bel-ia para o
// produto "lurem".
interface BelIaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface BelIaChatResponse {
  message: { content: string };
}

export async function belIaChat(
  baseUrl: string,
  apiKey: string,
  action: string,
  messages: BelIaMessage[],
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2 * 60 * 1000);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/v1/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ action, messages, stream: false }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`bel-ia error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as BelIaChatResponse;
  return data.message.content;
}
