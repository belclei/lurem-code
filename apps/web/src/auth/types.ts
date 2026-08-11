// apps/web/src/auth/types.ts
//
// Mirrors the backend contract's response shapes verbatim (see the sprint
// spec). Not sourced from @lurem/domain: Money/BreakdownLine there model
// packages/core's decomposed-calculation output (net worth, projections),
// a different shape than these flat list-endpoint DTOs — reusing them here
// would be forcing a fit, not deduplication.

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  birthDate: string;
  hasPassword: boolean;
  hasGoogle: boolean;
  hasCompleteProfile: boolean;
  // Judgment call: the spec doesn't enumerate role/avatarMode/themePref's
  // literal unions, and apps/web doesn't branch on their values anywhere
  // yet — kept as `string` rather than guessing at a union the backend
  // owns. Narrow this once a screen actually needs to switch on them.
  role: string;
  isBetaTester: boolean;
  avatarMode: string;
  avatarUrls: string[];
  themePref: string;
  createdAt: string;
  flags: Record<string, boolean>;
}

export interface InstitutionDto {
  id: string;
  name: string;
  compeCode: string;
  logoAsset: string;
  logoUrl?: string;
}

export type AccountType = "checking" | "cash";

export interface AccountDto {
  id: string;
  institutionId: string | null;
  institutionName: string;
  logoUrl?: string;
  name?: string;
  type: AccountType;
  currency: string;
  balanceCents: number;
  overdraftLimitCents: number;
  isOverLimit: boolean;
  isActive: boolean;
  archivedAt: string | null;
  hasTransactions: boolean;
}

export type TxKind = "income" | "expense" | "transfer";
export type TxSource = "manual" | "import";
export type TxDirection = "out" | "in";

// Mirrors apps/api/src/transactions/serialize.ts's InstallmentDetail —
// same field names as @lurem/ui's TransactionRow InstallmentDetail, so this
// passes through untouched from API response to TransactionRow prop.
export interface InstallmentDetailDto {
  originalAmountCents: number;
  originalDate: string;
  installmentNumber: number;
  installmentTotal: number;
  hasInterest: boolean;
  paidCount: number;
  paidAmountCents: number;
  remainingCount: number;
  remainingAmountCents: number;
  nextInstallmentDate: string;
  payoffDate: string;
}

export interface TransactionDto {
  id: string;
  kind: TxKind;
  source: TxSource;
  description: string;
  transactionDate: string;
  accountId: string | null;
  creditCardId: string | null;
  categoryId: string | null;
  currency: string;
  amountCents: number;
  amountBRLCents: number;
  isScheduled: boolean;
  transferPairId: string | null;
  transferDirection: TxDirection | null;
  installmentGroupId: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  installmentPurchaseAmountCents: number | null;
  recurringTransactionId: string | null;
  createdAt: string;
  // Optional: apps/api/src/timeline/aggregate.ts does not currently pass the
  // installmentsByGroupId map into toTransactionResponse(), so this is never
  // populated by GET /v1/timeline yet — the "installment" TransactionRow
  // variant below is wired for when that backend gap closes, but exercises
  // the categoryLabel ("Parcela N/M") fallback path in the meantime.
  installmentDetails?: InstallmentDetailDto;
}

export interface RecurringDto {
  id: string;
  description: string;
  kind: "income" | "expense";
  accountId: string | null;
  creditCardId: string | null;
  categoryId: string | null;
  referenceAmountCents: number;
  referenceAmountBRLCents: number;
  currency: string;
  dayOfMonth: number;
  isVariableAmount: boolean;
  isActive: boolean;
  startDate: string;
  endDate: string | null;
}

// GET /v1/recurring-transactions/pending — série "Confirmar todo mês" cujo
// mês corrente já venceu sem confirmação (§6.7 item 3, backlog "fila de
// pendência de aprovação"). Kept separate from RecurringDto: this is a
// derived/computed shape (dueDate is this month's occurrence, not the
// series' own dayOfMonth), not the series record itself.
export interface PendingRecurringDto {
  id: string;
  description: string;
  referenceAmountCents: number;
  dueDate: string;
  kind: "income" | "expense";
  accountId: string | null;
  creditCardId: string | null;
}

export type InvoiceStatus = "open" | "closed_awaiting_payment";

export interface CardDto {
  id: string;
  institutionId: string;
  institutionName: string;
  logoUrl?: string;
  name?: string;
  limitCents: number;
  closingDay: number;
  dueDay: number;
  autoDebitAccountId?: string | null;
  currency: string;
  isActive: boolean;
  archivedAt: string | null;
  hasTransactions: boolean;
  usedCents: number;
  isOverLimit: boolean;
  invoiceStatus: InvoiceStatus;
}

export interface TimelineEventDto {
  itemType: "event";
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  aggregateType: string;
  aggregateId: string;
}

export interface TimelineTransactionDto {
  itemType: "transaction";
  transaction: TransactionDto;
}

export type TimelineItemDto = TimelineEventDto | TimelineTransactionDto;

export interface TimelineDayDto {
  date: string;
  items: TimelineItemDto[];
  balanceCents: number;
}

export interface TimelinePageDto {
  days: TimelineDayDto[];
  nextCursor: string | null;
}

export type ConnectionStatus = "pending" | "accepted" | "rejected";

export interface ConnectionDto {
  id: string;
  status: ConnectionStatus;
  isRequester: boolean;
  counterpartUserId: string;
  counterpartName: string;
  counterpartEmail: string;
  createdAt: string;
  respondedAt: string | null;
  /** > 0 a meu favor ("a receber"), < 0 eu devo ("a acertar") — nunca linguagem de cobrança na UI. */
  settlementBalanceCents: number;
}

export type SharePermission = "view" | "edit";
export type ShareItemType = "account" | "credit_card";

export interface ShareDto {
  id: string;
  ownerUserId: string;
  sharedWithUserId: string;
  itemType: ShareItemType;
  accountId: string | null;
  creditCardId: string | null;
  permission: SharePermission;
  isOwner: boolean;
  createdAt: string;
}

export interface PortadorPendingDto {
  id: string;
  description: string;
  transactionDate: string;
  kind: TxKind;
  amountCents: number;
  amountBRLCents: number;
  currency: string;
  ownerUserId: string;
  ownerName: string;
}

export interface AdminWaitlistDto {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface AdminInviteDto {
  id: string;
  inviterUserId: string;
  inviteeName: string;
  inviteeEmail: string;
  createdAt: string;
}

export interface AdminAccessDto {
  waitlist: AdminWaitlistDto[];
  invites: AdminInviteDto[];
}

export type UserRole = "user" | "admin";
export type UserStatus = "active" | "disabled";

export interface AdminUserDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isBetaTester: boolean;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string | null;
  accountCount: number;
  cardCount: number;
  transactionCount: number;
}

export type InviteStatus =
  | "awaiting_approval"
  | "approved"
  | "registered"
  | "rejected"
  | "expired";

export interface MyInviteDto {
  id: string;
  inviteeName: string;
  inviteeEmail: string;
  status: InviteStatus;
  createdAt: string;
}

export interface AdminUsageDto {
  dau: number;
  wau: number;
  mau: number;
  retention: { d1: number; d7: number; d30: number };
  activationFunnel: {
    totalUsers: number;
    wallet: number;
    accounts: number;
    cards: number;
    allThree: number;
  };
}

export interface AdminHealthDto {
  database: "ok" | "error";
  redis: "ok" | "error";
  notAvailable: string[];
}
