// apps/web/src/routes/timeline/types.ts
import type { TxKind } from "../../auth/types";

export interface CategoryDto {
  id: string;
  name: string;
  kind: TxKind;
  icon: string;
  /** A CSS custom-property name (e.g. `"--lr-petrol-600"`) — paints TransactionRow's category accent border. */
  colorToken: string;
}
