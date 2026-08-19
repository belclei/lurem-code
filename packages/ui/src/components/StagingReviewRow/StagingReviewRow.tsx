import { Alert } from "../Alert/Alert";
import { Badge } from "../Badge/Badge";
import { Button } from "../Button/Button";
import { Card } from "../Card/Card";
import { Input } from "../Input/Input";
import type { SelectOption } from "../Select/Select";
import { Select } from "../Select/Select";
import { TagInput } from "../TagInput/TagInput";
import { Body } from "../Typography/Body";

export type StagingReviewStatus = "pending" | "confirmed" | "rejected";

export interface StagingReviewRowProps {
  description: string;
  onDescriptionChange: (value: string) => void;
  /** "Original: <raw>" — set only when a learned alias pre-filled `description`
   * away from the raw extracted text (§ description-alias). */
  descriptionHint?: string;
  /** Money-input string ("25,00"), same convention as Input's `money` mode. */
  amount: string;
  onAmountChange: (value: string) => void;
  categoryOptions: SelectOption[];
  categoryId: string | null;
  onCategoryIdChange: (value: string | null) => void;
  tagNames: string[];
  onTagNamesChange: (names: string[]) => void;
  tagSuggestions?: string[];
  /** ISO date string — meta line only, not editable here (kept out of the
   * edit surface: the extractor rarely gets the date wrong, and adding a
   * DateField would be a 4th field competing with description/valor/categoria
   * for the row's attention). */
  date: string;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
  cardHolderRaw?: string | null;
  /** 0..1 — only rendered as a badge below 0.5 (§ import-review-polish):
   * silence for normal/high confidence, a label only when it's actually
   * worth a second look. */
  confidence: number;
  status: StagingReviewStatus;
  /** "Atribuir <cardHolderRaw> a um conectado" — omitted entirely when there's
   * no cardHolderRaw or no accepted connection to assign to. */
  portadorOptions?: SelectOption[];
  portadorUserId?: string | null;
  onPortadorUserIdChange?: (value: string | null) => void;
  duplicateDescription?: string;
  error?: string | null;
  onConfirm?: () => void;
  onReject?: () => void;
  /** Only offered when a duplicate was detected — replaces the existing
   * Transaction instead of keeping both. */
  onReplace?: () => void;
  confirmLoading?: boolean;
  rejectLoading?: boolean;
  replaceLoading?: boolean;
}

/**
 * Lurem's import-review line item (§6.8, "a tela mais importante do fluxo").
 * Every editable field is always live — there's no separate "Editar" mode to
 * toggle into, matching how fast the actual review flow needs to move: read,
 * correct inline if needed, confirm. Dumb/controlled like Input/Select: all
 * state and the confirm/reject/replace mutations live with the caller.
 */
export function StagingReviewRow({
  description,
  onDescriptionChange,
  descriptionHint,
  amount,
  onAmountChange,
  categoryOptions,
  categoryId,
  onCategoryIdChange,
  tagNames,
  onTagNamesChange,
  tagSuggestions = [],
  date,
  installmentNumber,
  installmentTotal,
  cardHolderRaw,
  confidence,
  status,
  portadorOptions,
  portadorUserId = null,
  onPortadorUserIdChange,
  duplicateDescription,
  error,
  onConfirm,
  onReject,
  onReplace,
  confirmLoading = false,
  rejectLoading = false,
  replaceLoading = false,
}: StagingReviewRowProps) {
  if (status !== "pending") {
    return (
      <Card className="flex items-center justify-between opacity-60">
        <Body>{description}</Body>
        <Badge
          kind="status"
          status={status === "confirmed" ? "active" : "inactive"}
        >
          {status === "confirmed" ? "Confirmada" : "Rejeitada"}
        </Badge>
      </Card>
    );
  }

  const isDuplicate = Boolean(duplicateDescription);

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          {confidence < 0.5 ? (
            <Badge kind="status" status="alert">
              Confira os dados
            </Badge>
          ) : null}
        </div>
        <Body muted className="text-xs">
          {date.slice(0, 10).split("-").reverse().join("/")}
          {installmentNumber && installmentTotal
            ? ` · ${installmentNumber}/${installmentTotal}`
            : ""}
          {cardHolderRaw ? ` · ${cardHolderRaw}` : ""}
        </Body>
      </div>
      <div className="grid gap-2 sm:grid-cols-[2fr_10rem_1fr]">
        <Input
          label="Descrição"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          hint={descriptionHint}
        />
        <Input
          label="Valor"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          money
          affix="R$"
        />
        <Select
          label="Categoria"
          options={categoryOptions}
          value={categoryId}
          onChange={onCategoryIdChange}
          placeholder="Sem categoria"
        />
      </div>
      <TagInput
        label="Tags"
        value={tagNames}
        onChange={onTagNamesChange}
        suggestions={tagSuggestions}
      />
      {cardHolderRaw && portadorOptions && portadorOptions.length > 0 ? (
        <Select
          label={`Atribuir "${cardHolderRaw}" a um conectado`}
          options={portadorOptions}
          value={portadorUserId}
          onChange={onPortadorUserIdChange}
          placeholder="Não atribuir"
        />
      ) : null}
      {duplicateDescription ? (
        <Alert
          variant="warning"
          layout="inline"
          title="Possível duplicata"
          description={duplicateDescription}
        />
      ) : null}
      {error ? <Alert variant="error" layout="inline" title={error} /> : null}
      <div className="flex justify-end gap-2">
        {onReject ? (
          <Button
            type="button"
            variant="secondary"
            loading={rejectLoading}
            onClick={onReject}
          >
            {isDuplicate ? "Pular" : "Rejeitar"}
          </Button>
        ) : null}
        {isDuplicate && onReplace ? (
          <Button
            type="button"
            variant="secondary"
            loading={replaceLoading}
            onClick={onReplace}
          >
            Substituir
          </Button>
        ) : null}
        {onConfirm ? (
          <Button type="button" loading={confirmLoading} onClick={onConfirm}>
            {isDuplicate ? "Manter os dois" : "Confirmar"}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
