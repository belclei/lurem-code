// apps/web/src/routes/timeline/ImportTransactionsDialog.tsx
// Atalho pro fluxo de import (ImportPage.tsx) direto da Timeline — mesmo
// formulário (ImportUploadForm), só trocando a casca de página por Dialog.
import { Dialog } from "@lurem/ui";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { AccountDto, CardDto, InstitutionDto } from "../../auth/types";
import { ImportUploadForm } from "../../lib/imports/ImportUploadForm";
import { NewAccountDialog } from "./NewAccountDialog";
import { NewCardDialog } from "./NewCardDialog";

export function ImportTransactionsDialog({
  open,
  onClose,
  accounts,
  cards,
  institutions,
  onAccountsCreated,
  onCardsCreated,
}: {
  open: boolean;
  onClose: () => void;
  accounts: AccountDto[];
  cards: CardDto[];
  institutions: InstitutionDto[];
  onAccountsCreated?: () => void;
  onCardsCreated?: () => void;
}) {
  const navigate = useNavigate();
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [cardDialogOpen, setCardDialogOpen] = useState(false);

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="Importar transações"
        description="O arquivo nunca sai do seu dispositivo — o texto é extraído aqui mesmo, no navegador."
      >
        <ImportUploadForm
          accounts={accounts}
          cards={cards}
          onImported={(id) => {
            onClose();
            navigate({ to: "/imports/$id", params: { id } });
          }}
          onCreateCard={() => setCardDialogOpen(true)}
          onCreateAccount={() => setAccountDialogOpen(true)}
        />
      </Dialog>

      <NewAccountDialog
        key={accountDialogOpen ? "open" : "closed"}
        open={accountDialogOpen}
        onClose={() => setAccountDialogOpen(false)}
        institutions={institutions}
        onCreated={() => {
          setAccountDialogOpen(false);
          onAccountsCreated?.();
        }}
      />
      <NewCardDialog
        key={cardDialogOpen ? "open" : "closed"}
        open={cardDialogOpen}
        onClose={() => setCardDialogOpen(false)}
        institutions={institutions}
        accounts={accounts}
        onCreated={() => {
          setCardDialogOpen(false);
          onCardsCreated?.();
        }}
      />
    </>
  );
}
