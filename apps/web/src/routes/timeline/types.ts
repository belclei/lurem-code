// apps/web/src/routes/timeline/types.ts
import type { TxKind } from "../../auth/types";

export interface CategoryDto {
  id: string;
  name: string;
  kind: TxKind;
  icon: string;
}
