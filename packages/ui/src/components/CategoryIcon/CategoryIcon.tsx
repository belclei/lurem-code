export interface CategoryIconProps {
  slug: string; // ex: "hm-cat-alimentacao"
  categoryName?: string; // for aria-label
  className?: string;
}

// Emoji mapping per category (replaces the 14 SVG icons + fallback).
const CATEGORY_EMOJIS: Record<string, string> = {
  "hm-cat-alimentacao": "🍽️",
  "hm-cat-moradia": "🏠",
  "hm-cat-transporte": "🚗",
  "hm-cat-saude": "🩺",
  "hm-cat-lazer": "🎬",
  "hm-cat-servicos": "🔧",
  "hm-cat-compras": "🛍️",
  "hm-cat-renda": "💰",
  "hm-cat-impostos": "🧾",
  "hm-cat-dividas": "💳",
  "hm-cat-poupanca": "🐷",
  "hm-cat-doacoes": "❤️",
  "hm-cat-assinaturas": "🔁",
  "hm-cat-transferencia": "🔀",
  "hm-cat-sem-categoria": "❔",
};

export function CategoryIcon({
  slug,
  categoryName,
  className,
}: CategoryIconProps) {
  const emoji =
    CATEGORY_EMOJIS[slug] ?? CATEGORY_EMOJIS["hm-cat-sem-categoria"];
  return (
    <span
      role="img"
      aria-label={categoryName || slug}
      className={className ?? ""}
    >
      {emoji}
    </span>
  );
}
