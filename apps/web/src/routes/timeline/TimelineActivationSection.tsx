// apps/web/src/routes/timeline/TimelineActivationSection.tsx
import { Alert } from "@lurem/ui";
import { useState } from "react";
import { WalletDialog } from "./WalletDialog";

export interface TimelineActivationSectionProps {
  activationDoneCount: number;
  hasWallet: boolean;
  hasBankAccount: boolean;
  hasCard: boolean;
  walletDialogOpen: boolean;
  onWalletDialogOpenChange: (open: boolean) => void;
  onOpenAccountDialog: () => void;
  onOpenCardDialog: () => void;
  onWalletCreated: () => void;
}

/** US-4.1's "PRIMEIROS PASSOS" activation section (§6.11) — shown alongside
 * the feed while wallet/accounts/cards aren't all registered yet. Purely
 * presentational aside from owning WalletDialog's open state locally;
 * account/card additions open NewAccountDialog/NewCardDialog directly
 * (issues.md: never navigate away to /accounts). */
export function TimelineActivationSection({
  activationDoneCount,
  hasWallet,
  hasBankAccount,
  hasCard,
  walletDialogOpen,
  onWalletDialogOpenChange,
  onOpenAccountDialog,
  onOpenCardDialog,
  onWalletCreated,
}: TimelineActivationSectionProps) {
  // Fechável (issues.md): dispensar o lembrete de contas/cartões não marca a
  // etapa como concluída — só some da vista até a próxima vez que a página
  // remontar. Nenhuma etapa "concluída" (variant="success") precisa disso,
  // só as pendentes, que são as que o usuário pode achar repetitivas.
  const [dismissed, setDismissed] = useState<Set<"contas" | "cartoes">>(
    new Set(),
  );
  return (
    <div>
      <p className="mb-4 text-[.9375rem] text-[var(--lr-text-secondary)]">
        Sua história ainda vai começar. Cadastre suas contas e cartões — na
        ordem que quiser — e tudo aparece aqui em ordem, com o saldo de cada
        dia.
      </p>
      <section>
        <h2 className="mb-1 text-[.8125rem] font-bold text-[var(--lr-text)]">
          PRIMEIROS PASSOS
        </h2>
        <p className="mb-4 text-sm text-[var(--lr-text-secondary)]">
          {activationDoneCount} de 3 concluídos
        </p>
        <div className="flex flex-col gap-2">
          {hasWallet ? (
            <Alert
              variant="success"
              title="Carteira registrada"
              description="Seu dinheiro físico já faz parte da Timeline."
            />
          ) : (
            <Alert
              variant="warning"
              title="Carteira"
              description="Não sabe por onde começar? Comece registrando quanto dinheiro físico você tem."
              actions={[
                {
                  label: "Adicionar",
                  onClick: () => onWalletDialogOpenChange(true),
                },
              ]}
            />
          )}
          {hasBankAccount ? (
            <Alert
              variant="success"
              title="Contas registradas"
              description="Suas contas já aparecem na Timeline."
            />
          ) : dismissed.has("contas") ? null : (
            <Alert
              variant="info"
              title="Contas"
              description="Adicione as contas de banco onde seu dinheiro vive."
              actions={[
                {
                  label: "Adicionar contas",
                  onClick: onOpenAccountDialog,
                },
              ]}
              onClose={() =>
                setDismissed((prev) => new Set(prev).add("contas"))
              }
            />
          )}
          {hasCard ? (
            <Alert
              variant="success"
              title="Cartões registrados"
              description="Seus cartões já aparecem na Timeline."
            />
          ) : dismissed.has("cartoes") ? null : (
            <Alert
              variant="info"
              title="Cartões"
              description="Adicione seus cartões de crédito — limite, fechamento e vencimento."
              actions={[
                {
                  label: "Adicionar cartões",
                  onClick: onOpenCardDialog,
                },
              ]}
              onClose={() =>
                setDismissed((prev) => new Set(prev).add("cartoes"))
              }
            />
          )}
        </div>
      </section>
      <WalletDialog
        open={walletDialogOpen}
        onClose={() => onWalletDialogOpenChange(false)}
        onCreated={onWalletCreated}
      />
    </div>
  );
}
