"use client";

import React from "react";
import TimeSlotPicker from "@/components/ui/time-slot-picker";
import type { TimeSlotPickerDay } from "@/components/ui/time-slot-picker";

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Next Monday on or after `from`. */
function nextMonday(from: Date) {
  const d = new Date(from);
  const offset = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + (d.getDay() === 1 ? 0 : offset));
  return d;
}

function buildDays(): TimeSlotPickerDay[] {
  const start = nextMonday(new Date());
  const template = [
    [
      { time: "09:00" },
      { time: "09:30", available: false },
      { time: "10:00" },
      { time: "11:30" },
      { time: "14:00", available: false },
      { time: "15:30" },
    ],
    [
      { time: "09:00" },
      { time: "10:30" },
      { time: "13:00", available: false },
      { time: "16:00" },
    ],
    [
      { time: "09:30" },
      { time: "11:00" },
      { time: "12:30" },
      { time: "14:30", available: false },
    ],
    [
      { time: "10:00", available: false },
      { time: "11:30", available: false },
    ],
    [
      { time: "09:00" },
      { time: "10:00" },
      { time: "13:30" },
      { time: "15:00" },
    ],
  ];
  return template.map((slots, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return { date: toISODate(d), slots };
  });
}

export default function TimeSlotPickerDemo() {
  const days = React.useMemo(buildDays, []);
  const [value, setValue] = React.useState("");

  return (
    <div className="flex w-full max-w-md flex-col gap-4 rounded-[var(--radius-card,20px)] border border-line bg-surface p-6 shadow-sm">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">
          Book a 30-minute demo
        </h2>
        <p className="text-[13px] text-ink-faint">
          Pick a time that works for you.
        </p>
      </div>
      <TimeSlotPicker
        days={days}
        value={value}
        onValueChange={setValue}
        timeZoneLabel="Europe/London (BST)"
      />
      <div className="flex items-center justify-between border-t border-line pt-3">
        <span className="text-[12px] font-medium text-ink-faint">
          value: {value ? value : "—"}
        </span>
        <button
          type="button"
          disabled={!value}
          className="rounded-full bg-accent px-4 py-1.5 text-[13px] font-semibold text-accent-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          Pick a time
        </button>
      </div>
    </div>
  );
}
