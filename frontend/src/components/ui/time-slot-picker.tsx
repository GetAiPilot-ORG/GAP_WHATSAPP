"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface TimeSlotPickerSlot {
  /** 24-hour `HH:mm`, in the timezone named by `timeZoneLabel`. */
  time: string;
  /** Taken or blocked slots stay visible, struck through, so the gaps make sense. */
  available?: boolean;
}

export interface TimeSlotPickerDay {
  /** ISO `yyyy-mm-dd`. */
  date: string;
  slots: TimeSlotPickerSlot[];
}

export interface TimeSlotPickerProps {
  /** Days in the strip, in order, each with its slots. */
  days: TimeSlotPickerDay[];
  /** Controlled choice as `yyyy-mm-ddTHH:mm`, or empty. */
  value?: string;
  /** Starting choice when uncontrolled. */
  defaultValue?: string;
  /** Called with `yyyy-mm-ddTHH:mm` when a slot is chosen. */
  onValueChange?: (value: string) => void;
  /** Timezone the times are shown in, printed under the grid. Defaults to the browser's. */
  timeZoneLabel?: string;
  /** Slots per row. */
  columns?: 2 | 3 | 4;
  /** BCP 47 locale for day and time formats. */
  locale?: string;
  /** Accessible name for the whole picker. */
  label?: string;
  /** Merged last, so it wins. */
  className?: string;
}

const toDate = (date: string, time = "00:00") => {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min);
};

const COLS = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" };

/**
 * A booking slot picker: a strip of days, then that day's times. Two radio
 * groups, because they are two answers — the day only narrows the grid, the
 * time is the value.
 *
 * Unavailable slots stay in the grid, struck through and skipped by the arrow
 * keys, so a morning with one opening reads as a busy morning rather than a
 * short one. The timezone is always printed: a time without one is how people
 * turn up an hour late.
 */
export function TimeSlotPicker({
  days,
  value,
  defaultValue = "",
  onValueChange,
  timeZoneLabel,
  columns = 3,
  locale = "en-US",
  label = "Choose a time",
  className,
}: TimeSlotPickerProps) {
  const uid = useId();
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const current = value ?? uncontrolled;
  const [chosenDate, chosenTime] = current.split("T");
  const [dayIndex, setDayIndex] = useState(() =>
    Math.max(
      0,
      days.findIndex((day) => day.date === chosenDate),
    ),
  );
  // A controlled value on another day brings that day into view.
  useEffect(() => {
    const index = days.findIndex((entry) => entry.date === chosenDate);
    if (index >= 0) setDayIndex(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenDate]);
  const day = days[Math.min(dayIndex, days.length - 1)];
  const dayRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const slotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const zone =
    timeZoneLabel ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  const open = (slots: TimeSlotPickerSlot[]) =>
    slots.filter((slot) => slot.available !== false).length;
  const longDay = (date: string) =>
    toDate(date).toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });

  const choose = (time: string) => {
    const next = `${day.date}T${time}`;
    if (value === undefined) setUncontrolled(next);
    onValueChange?.(next);
  };

  /** Arrow movement shared by both groups; `step` maps a key to an index delta. */
  const rove = (
    event: KeyboardEvent,
    index: number,
    count: number,
    step: Record<string, number>,
    usable: (i: number) => boolean,
    act: (i: number) => void,
  ) => {
    const delta = step[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    for (let offset = 1; offset <= count; offset += 1) {
      const next = (((index + delta * offset) % count) + count) % count;
      if (usable(next)) return act(next);
    }
  };

  const slots = day?.slots ?? [];
  const checkedSlot =
    chosenDate === day?.date
      ? slots.findIndex((slot) => slot.time === chosenTime)
      : -1;
  const slotStop =
    checkedSlot >= 0
      ? checkedSlot
      : slots.findIndex((slot) => slot.available !== false);
  const time = (t: string) =>
    toDate(day.date, t).toLocaleTimeString(locale, {
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex w-full flex-col gap-4", className)}
    >
      <div
        role="radiogroup"
        aria-label="Day"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {days.map((entry, index) => {
          const selected = index === dayIndex;
          const date = toDate(entry.date);
          const count = open(entry.slots);
          return (
            <button
              key={entry.date}
              ref={(node) => {
                dayRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${longDay(entry.date)}, ${count === 0 ? "fully booked" : `${count} ${count === 1 ? "time" : "times"} free`}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setDayIndex(index)}
              onKeyDown={(event) =>
                rove(
                  event,
                  index,
                  days.length,
                  { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 },
                  () => true,
                  (next) => {
                    setDayIndex(next);
                    dayRefs.current[next]?.focus();
                  },
                )
              }
              className={cn(
                "flex w-16 shrink-0 flex-col items-center gap-0.5 rounded-[var(--radius-tile)] border py-2 transition-colors",
                selected
                  ? "border-accent-strong bg-accent text-accent-ink"
                  : "border-line bg-surface text-ink hover:border-line-strong",
                count === 0 && !selected && "text-ink-faint",
              )}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                {date.toLocaleDateString(locale, { weekday: "short" })}
              </span>
              <span className="text-[18px] font-bold leading-tight tabular-nums">
                {date.getDate()}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full",
                  count === 0
                    ? "bg-transparent"
                    : selected
                      ? "bg-accent-ink"
                      : "bg-accent-strong",
                )}
              />
            </button>
          );
        })}
      </div>

      {day && (
        <div className="flex flex-col gap-2">
          <span
            id={`${uid}-day`}
            className="text-[13px] font-semibold text-ink-soft"
          >
            {longDay(day.date)}
          </span>
          {slots.length === 0 || open(slots) === 0 ? (
            <p className="rounded-[var(--radius-tile)] border border-dashed border-line px-4 py-6 text-center text-[13px] font-medium text-ink-faint">
              No times left on this day. Try another.
            </p>
          ) : (
            <div
              role="radiogroup"
              aria-labelledby={`${uid}-day`}
              className={cn("grid gap-2", COLS[columns])}
            >
              {slots.map((slot, index) => {
                const unavailable = slot.available === false;
                const checked = index === checkedSlot;
                return (
                  <button
                    key={slot.time}
                    ref={(node) => {
                      slotRefs.current[index] = node;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    disabled={unavailable}
                    tabIndex={index === slotStop ? 0 : -1}
                    onClick={() => choose(slot.time)}
                    onKeyDown={(event) =>
                      rove(
                        event,
                        index,
                        slots.length,
                        {
                          ArrowRight: 1,
                          ArrowLeft: -1,
                          ArrowDown: columns,
                          ArrowUp: -columns,
                        },
                        (i) => slots[i].available !== false,
                        (next) => {
                          choose(slots[next].time);
                          slotRefs.current[next]?.focus();
                        },
                      )
                    }
                    className={cn(
                      "h-10 rounded-full border text-[13px] tabular-nums transition-colors",
                      checked
                        ? "border-accent-strong bg-accent font-bold text-accent-ink"
                        : "border-line bg-surface font-semibold text-ink hover:border-line-strong",
                      "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-surface-muted disabled:font-medium disabled:text-ink-faint disabled:line-through",
                    )}
                  >
                    {time(slot.time)}
                    {unavailable && (
                      <span className="sr-only">, unavailable</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <p className="text-[12px] font-medium text-ink-faint">
        Times shown in {zone.replace(/_/g, " ")}
      </p>
    </div>
  );
}

export default TimeSlotPicker;
