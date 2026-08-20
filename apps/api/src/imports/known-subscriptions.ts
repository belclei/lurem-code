// Lista curada de assinaturas recorrentes comuns no Brasil — usada só pra
// oferecer a sugestão "isso parece uma assinatura" já na 1ª ocorrência (o
// padrão genérico em recurring-detection.ts cobre tudo o mais, mas exige 3
// ocorrências pra ter confiança). Matching por SUBSTRING case-insensitive,
// não exato como DescriptionAlias — soft descriptors variam por como cada
// lojista configura o processador de pagamento (ex.: "NETFLIX.COM" vs
// "NETFLIX.COM LOS GATOS CA" são o mesmo serviço).
//
// Cuidado com iFood/Uber: o padrão tem que casar só a variante de
// ASSINATURA (Clube/One), nunca o nome genérico do app — senão todo pedido
// de comida ou toda corrida vira falso positivo de "assinatura".
export interface KnownSubscription {
  pattern: RegExp;
  label: string;
}

export const KNOWN_SUBSCRIPTIONS: KnownSubscription[] = [
  { pattern: /netflix/i, label: "Netflix" },
  { pattern: /hbo\s*max|hbomax/i, label: "HBO Max" },
  { pattern: /disney\s*\+?|disneyplus/i, label: "Disney+" },
  {
    pattern: /prime\s*video|amazon\s*prime|primevideo/i,
    label: "Amazon Prime",
  },
  { pattern: /apple\s*tv/i, label: "Apple TV+" },
  { pattern: /globoplay/i, label: "Globoplay" },
  { pattern: /paramount\s*\+?/i, label: "Paramount+" },
  { pattern: /spotify/i, label: "Spotify" },
  { pattern: /deezer/i, label: "Deezer" },
  { pattern: /youtube\s*premium|youtubepremium/i, label: "YouTube Premium" },
  { pattern: /apple\s*music/i, label: "Apple Music" },
  { pattern: /ifood\s*clube/i, label: "iFood Clube" },
  { pattern: /uber\s*one/i, label: "Uber One" },
  { pattern: /google\s*one/i, label: "Google One" },
  { pattern: /icloud/i, label: "iCloud" },
  { pattern: /playstation\s*plus|ps\s*plus/i, label: "PlayStation Plus" },
  { pattern: /xbox\s*game\s*pass|game\s*pass/i, label: "Xbox Game Pass" },
];

export function matchKnownSubscription(description: string): string | null {
  for (const { pattern, label } of KNOWN_SUBSCRIPTIONS) {
    if (pattern.test(description)) return label;
  }
  return null;
}
