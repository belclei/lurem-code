// apps/web/src/routes/timeline/TimelineFilterBar.tsx
import { Button, Calendar, Checkbox, EyeIcon, Popover } from "@lurem/ui";
import type { CalendarRange } from "@lurem/ui";
import { periodLabel, thisMonthRange } from "./dateHelpers";
import { EVENT_TYPE_GROUPS } from "./eventTypeGroups";
import type { Chip } from "./transactionRowHelpers";
import { institutionDotColor } from "./transactionRowHelpers";
import type { CategoryDto } from "./types";

export interface TimelineFilterBarProps {
  chips: Chip[];
  hiddenChipIds: Set<string>;
  onToggleChip: (id: string) => void;
  hasActiveFilter: boolean;
  accountsOpen: boolean;
  onAccountsOpenChange: (open: boolean) => void;

  periodRange: CalendarRange;
  onPeriodRangeChange: (range: CalendarRange) => void;
  calendarMonth: Date;
  onCalendarMonthChange: (date: Date) => void;
  periodOpen: boolean;
  onPeriodOpenChange: (open: boolean) => void;

  hiddenEventGroupIds: Set<string>;
  onToggleEventGroup: (id: string) => void;
  eventTypesOpen: boolean;
  onEventTypesOpenChange: (open: boolean) => void;

  categories: CategoryDto[];
  categoryFilterId: string | null;
  onCategoryFilterIdChange: (id: string | null) => void;
  categoryOpen: boolean;
  onCategoryOpenChange: (open: boolean) => void;
}

/** Timeline's filter toolbar (§6.12/§3) — period, event-type, category and
 * account/card chip popovers. Self-contained "MOSTRAR" row: every filter's
 * open/checked state lives in the parent (TimelinePage owns the query that
 * actually applies them), this component only renders the popovers and
 * reports interactions back up. */
export function TimelineFilterBar({
  chips,
  hiddenChipIds,
  onToggleChip,
  hasActiveFilter,
  accountsOpen,
  onAccountsOpenChange,
  periodRange,
  onPeriodRangeChange,
  calendarMonth,
  onCalendarMonthChange,
  periodOpen,
  onPeriodOpenChange,
  hiddenEventGroupIds,
  onToggleEventGroup,
  eventTypesOpen,
  onEventTypesOpenChange,
  categories,
  categoryFilterId,
  onCategoryFilterIdChange,
  categoryOpen,
  onCategoryOpenChange,
}: TimelineFilterBarProps) {
  const eventTypesFilterActive = hiddenEventGroupIds.size > 0;
  const eventTypesTriggerLabel = eventTypesFilterActive
    ? `Tipo de evento (${EVENT_TYPE_GROUPS.length - hiddenEventGroupIds.size}/${EVENT_TYPE_GROUPS.length})`
    : "Todos os tipos";
  const categoryFilterLabel = categoryFilterId
    ? (categories.find((c) => c.id === categoryFilterId)?.name ?? "Categoria")
    : "Todas as categorias";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5 border-y border-[var(--lr-border)] py-3">
      <span className="lr-label">MOSTRAR</span>
      {chips.length > 0 ? (
        <Popover
          label="Filtrar por conta ou cartão"
          triggerLabel={
            hasActiveFilter
              ? `${chips.length - hiddenChipIds.size} de ${chips.length} contas`
              : "Todas as contas"
          }
          open={accountsOpen}
          onOpenChange={onAccountsOpenChange}
        >
          <div className="flex w-[260px] max-w-[calc(100vw-2rem)] flex-col gap-0.5 rounded-[var(--lr-r-md)] border border-[var(--lr-border)] bg-[var(--lr-surface)] p-1.5 shadow-[var(--lr-e2)]">
            {chips.map((chip) => {
              const checked = !hiddenChipIds.has(chip.id);
              // Same guard as the event-type filter below: an empty
              // accountIds/cardIds CSV collapses back to "no filter"
              // server-side (splitCsv, apps/api/src/timeline/routes.ts),
              // so hiding the last visible chip would silently show
              // everything instead of nothing.
              const isLastVisible =
                checked && hiddenChipIds.size >= chips.length - 1;
              return (
                <div
                  key={chip.id}
                  className="flex items-center gap-2.5 rounded-[var(--lr-r-sm)] px-2 py-1.5"
                >
                  <span
                    aria-hidden="true"
                    className={[
                      "h-2 w-2 flex-none rounded-full",
                      institutionDotColor(chip.id),
                    ].join(" ")}
                  />
                  <span className="min-w-0 flex-1 truncate text-[.875rem] text-[var(--lr-text)]">
                    {chip.label}
                  </span>
                  <button
                    type="button"
                    aria-label={
                      isLastVisible
                        ? `${chip.label} — última conta visível`
                        : `${checked ? "Ocultar" : "Mostrar"} ${chip.label}`
                    }
                    disabled={isLastVisible}
                    onClick={() => onToggleChip(chip.id)}
                    className={[
                      "flex h-7 w-7 flex-none items-center justify-center rounded-[var(--lr-r-sm)] [&>svg]:h-4 [&>svg]:w-4",
                      "text-[var(--lr-text-secondary)] hover:bg-[var(--lr-surface-sunken)] hover:text-[var(--lr-text)]",
                      "disabled:cursor-not-allowed disabled:opacity-40",
                    ].join(" ")}
                  >
                    <EyeIcon open={checked} />
                  </button>
                </div>
              );
            })}
          </div>
        </Popover>
      ) : null}

      <Popover
        label="Filtrar por período"
        triggerLabel={periodLabel(periodRange)}
        open={periodOpen}
        onOpenChange={onPeriodOpenChange}
      >
        <Calendar
          className="max-w-[calc(100vw-2rem)]"
          label="Selecione o período"
          mode="range"
          month={calendarMonth}
          onMonthChange={onCalendarMonthChange}
          selected={periodRange}
          onSelect={(value) => {
            const range = value as CalendarRange;
            onPeriodRangeChange(range);
            if (range.from && range.to) onPeriodOpenChange(false);
          }}
          footer={
            <>
              <Button
                variant="tertiary"
                size="sm"
                onClick={() => {
                  onPeriodRangeChange(thisMonthRange());
                  onPeriodOpenChange(false);
                }}
              >
                Este mês
              </Button>
              <Button
                variant="tertiary"
                size="sm"
                onClick={() => {
                  onPeriodRangeChange({});
                  onPeriodOpenChange(false);
                }}
              >
                Limpar
              </Button>
            </>
          }
        />
      </Popover>

      <Popover
        label="Filtrar por tipo de evento"
        triggerLabel={eventTypesTriggerLabel}
        open={eventTypesOpen}
        onOpenChange={onEventTypesOpenChange}
      >
        <div className="flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-2.5 rounded-[var(--lr-r-md)] border border-[var(--lr-border)] bg-[var(--lr-surface)] p-3.5 shadow-[var(--lr-e2)]">
          {EVENT_TYPE_GROUPS.map((group) => {
            const checked = !hiddenEventGroupIds.has(group.id);
            const isLastVisible =
              checked &&
              hiddenEventGroupIds.size >= EVENT_TYPE_GROUPS.length - 1;
            return (
              <Checkbox
                key={group.id}
                label={group.label}
                checked={checked}
                disabled={isLastVisible}
                onChange={() => onToggleEventGroup(group.id)}
              />
            );
          })}
        </div>
      </Popover>

      <Popover
        label="Filtrar por categoria"
        triggerLabel={categoryFilterLabel}
        open={categoryOpen}
        onOpenChange={onCategoryOpenChange}
      >
        <div className="flex w-56 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[var(--lr-r-md)] border border-[var(--lr-border)] bg-[var(--lr-surface)] py-1 shadow-[var(--lr-e2)]">
          {[
            {
              id: null as string | null,
              label: "Todas as categorias",
            },
            ...categories.map((c) => ({
              id: c.id,
              label: c.name,
            })),
          ].map((option) => (
            <button
              key={option.id ?? "__all__"}
              type="button"
              onClick={() => {
                onCategoryFilterIdChange(option.id);
                onCategoryOpenChange(false);
              }}
              className={[
                "px-3.5 py-2 text-left text-[.875rem]",
                // REBRAND (Task 1.3): blue-100/700 -> petrol-100/700.
                // Not in the task-1.3 brief's original site list (this
                // usage was missed by the recon grep) but structurally
                // identical to Select.tsx's "selected item" treatment
                // (same classes, same purpose: a selected filter
                // option) — classified as selection-state/Petrol per
                // DESIGN_SYSTEM.md §1.2, not the info/link/graphite
                // bucket, despite living in the same file as the
                // graphite-classified plain link further down.
                categoryFilterId === option.id
                  ? "bg-[var(--lr-petrol-100)] font-bold text-[var(--lr-text)] dark:bg-[var(--lr-petrol-700)]/30"
                  : "text-[var(--lr-text)] hover:bg-[var(--lr-surface-sunken)]",
              ].join(" ")}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
}
