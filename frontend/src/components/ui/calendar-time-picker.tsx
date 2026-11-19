"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, Clock, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export interface TimeSlotOption {
  time: string // e.g. "09:00" or "09:30"
  display?: string // e.g. "09:00 AM"
  isTaken?: boolean
  isPast?: boolean
  disabled?: boolean
}

export interface CalendarTimePickerProps {
  /** Selected date in `YYYY-MM-DD` format */
  selectedDate?: string
  /** Callback when date changes */
  onDateChange?: (dateStr: string) => void
  /** Selected time in `HH:mm` format */
  selectedTime?: string
  /** Callback when time changes */
  onTimeChange?: (timeStr: string) => void
  /** List of time slot options */
  availableSlots?: TimeSlotOption[]
  /** Min selectable date (YYYY-MM-DD). Defaults to today */
  minDate?: string
  /** Max selectable date (YYYY-MM-DD) */
  maxDate?: string
  /** Active working days (0 = Sunday, 1 = Monday, ..., 6 = Saturday) */
  workingDays?: number[]
  /** Additional class name for outer container */
  className?: string
  /** Label for the times column */
  timesHeader?: string
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

function formatYMD(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0")
  const d = String(day).padStart(2, "0")
  return `${year}-${m}-${d}`
}

function parseYMD(dateStr?: string) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split("-").map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

export function CalendarTimePicker({
  selectedDate,
  onDateChange,
  selectedTime,
  onTimeChange,
  availableSlots = [],
  minDate,
  maxDate,
  workingDays,
  className,
  timesHeader = "Available Times",
}: CalendarTimePickerProps) {
  // Today's reference
  const today = React.useMemo(() => new Date(), [])
  const todayStr = React.useMemo(
    () => formatYMD(today.getFullYear(), today.getMonth(), today.getDate()),
    [today]
  )

  const effectiveMinDate = minDate ?? todayStr

  // Current viewed month and year
  const initialDate = parseYMD(selectedDate) || today
  const [currentYear, setCurrentYear] = React.useState(initialDate.getFullYear())
  const [currentMonth, setCurrentMonth] = React.useState(initialDate.getMonth())

  // Keep viewed month synced if selectedDate changes externally
  React.useEffect(() => {
    if (selectedDate) {
      const d = parseYMD(selectedDate)
      if (d) {
        setCurrentYear(d.getFullYear())
        setCurrentMonth(d.getMonth())
      }
    }
  }, [selectedDate])

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear((y) => y - 1)
    } else {
      setCurrentMonth((m) => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear((y) => y + 1)
    } else {
      setCurrentMonth((m) => m + 1)
    }
  }

  // Generate 42 calendar grid cells (6 rows x 7 days)
  const calendarGrid = React.useMemo(() => {
    const cells: Array<{
      dateStr: string
      dayNum: number
      isCurrentMonth: boolean
      isToday: boolean
      isSelected: boolean
      isDisabled: boolean
      dayOfWeek: number
    }> = []

    // First day of current month (0=Sun, 1=Mon, ..., 6=Sat)
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay()
    // Total days in current month
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
    // Days in previous month
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate()

    // 1. Previous month leading days
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i
      const dateStr = formatYMD(prevYear, prevMonth, dayNum)
      const dateObj = new Date(prevYear, prevMonth, dayNum)
      const dayOfWeek = dateObj.getDay()
      const isPast = effectiveMinDate ? dateStr < effectiveMinDate : false
      const isClosed = workingDays ? !workingDays.includes(dayOfWeek) : false

      cells.push({
        dateStr,
        dayNum,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        isDisabled: isPast || isClosed,
        dayOfWeek,
      })
    }

    // 2. Current month days
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dateStr = formatYMD(currentYear, currentMonth, dayNum)
      const dateObj = new Date(currentYear, currentMonth, dayNum)
      const dayOfWeek = dateObj.getDay()
      const isPast = effectiveMinDate ? dateStr < effectiveMinDate : false
      const isMax = maxDate ? dateStr > maxDate : false
      const isClosed = workingDays ? !workingDays.includes(dayOfWeek) : false

      cells.push({
        dateStr,
        dayNum,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        isDisabled: isPast || isMax || isClosed,
        dayOfWeek,
      })
    }

    // 3. Next month trailing days to complete 42 cells (6 full weeks)
    const remaining = 42 - cells.length
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear
    for (let dayNum = 1; dayNum <= remaining; dayNum++) {
      const dateStr = formatYMD(nextYear, nextMonth, dayNum)
      const dateObj = new Date(nextYear, nextMonth, dayNum)
      const dayOfWeek = dateObj.getDay()
      const isPast = effectiveMinDate ? dateStr < effectiveMinDate : false
      const isMax = maxDate ? dateStr > maxDate : false
      const isClosed = workingDays ? !workingDays.includes(dayOfWeek) : false

      cells.push({
        dateStr,
        dayNum,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        isDisabled: isPast || isMax || isClosed,
        dayOfWeek,
      })
    }

    return cells
  }, [currentYear, currentMonth, effectiveMinDate, maxDate, workingDays, selectedDate, todayStr])

  // Format time for display if not already provided
  const formatSlotTime = (slot: TimeSlotOption) => {
    if (slot.display) return slot.display
    const [hStr, mStr] = slot.time.split(":")
    const h = parseInt(hStr || "0", 10)
    const m = mStr || "00"
    const period = h >= 12 ? "PM" : "AM"
    const hour12 = h % 12 === 0 ? 12 : h % 12
    return `${String(hour12).padStart(2, "0")}:${m} ${period}`
  }

  return (
    <div
      className={cn(
        "bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden",
        "grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200",
        className
      )}
    >
      {/* LEFT COLUMN: Clean Calendar */}
      <div className="p-4 sm:p-6 lg:p-7 flex flex-col justify-between select-none">
        {/* Month Header Navigation */}
        <div className="flex items-center justify-between pb-4">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-2 rounded-lg text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <h2 className="text-sm sm:text-base font-semibold text-gray-900 tracking-tight">
            {MONTH_NAMES[currentMonth]} {currentYear}
          </h2>

          <button
            type="button"
            onClick={handleNextMonth}
            className="p-2 rounded-lg text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Weekday Labels (Su, Mo, Tu, We, Th, Fr, Sa) */}
        <div className="grid grid-cols-7 mb-2 text-center">
          {WEEKDAYS.map((weekday) => (
            <div
              key={weekday}
              className="text-xs sm:text-sm font-medium text-gray-400 py-1.5"
            >
              {weekday}
            </div>
          ))}
        </div>

        {/* 42 Calendar Cells Grid */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center">
          {calendarGrid.map((cell, idx) => {
            const isClickable = !cell.isDisabled

            return (
              <button
                key={`${cell.dateStr}-${idx}`}
                type="button"
                disabled={cell.isDisabled}
                onClick={() => {
                  if (isClickable && onDateChange) {
                    onDateChange(cell.dateStr)
                    const [y, m] = cell.dateStr.split("-").map(Number)
                    if (y && m) {
                      setCurrentYear(y)
                      setCurrentMonth(m - 1)
                    }
                  }
                }}
                className={cn(
                  "h-10 sm:h-11 w-full flex items-center justify-center text-xs sm:text-sm transition-all relative font-medium",
                  // Selected State: Solid black rounded rectangle with white text (matches image exactly)
                  cell.isSelected &&
                    "bg-neutral-900 text-white font-semibold rounded-xl shadow-xs z-10 hover:bg-neutral-900",
                  // Current month normal day
                  !cell.isSelected &&
                    cell.isCurrentMonth &&
                    !cell.isDisabled &&
                    "text-gray-800 hover:bg-gray-100 rounded-xl cursor-pointer",
                  // Outside month day (unselected)
                  !cell.isSelected &&
                    !cell.isCurrentMonth &&
                    !cell.isDisabled &&
                    "text-gray-400 hover:bg-gray-50 rounded-xl cursor-pointer",
                  // Disabled days (past dates or closed days)
                  cell.isDisabled &&
                    (cell.isCurrentMonth
                      ? "text-gray-300 cursor-not-allowed line-through"
                      : "text-gray-200 cursor-not-allowed"),
                  // Subtle dot for Today when not selected
                  cell.isToday && !cell.isSelected && "font-bold text-blue-600"
                )}
              >
                <span>{cell.dayNum}</span>
                {cell.isToday && !cell.isSelected && (
                  <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-blue-600" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* RIGHT COLUMN: Available Times */}
      <div className="p-4 sm:p-6 lg:p-7 flex flex-col justify-between bg-white">
        {/* Header */}
        <div className="text-center pb-4">
          <h3 className="text-sm sm:text-base font-semibold text-gray-900 tracking-tight">
            {timesHeader}
          </h3>
        </div>

        {/* Scrollable Slots Container */}
        <div className="flex-1 max-h-[380px] sm:max-h-[420px] overflow-y-auto space-y-2.5 pr-2 scrollbar-thin">
          {availableSlots.length === 0 ? (
            <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center p-6 text-gray-400 space-y-1.5">
              <Clock className="w-8 h-8 text-gray-300" />
              <p className="text-xs font-medium text-gray-500">No time slots available</p>
              <p className="text-[11px] text-gray-400">Please choose another date</p>
            </div>
          ) : (
            availableSlots.map((slot) => {
              const isSelected = selectedTime === slot.time
              const isTaken = Boolean(slot.isTaken)
              const isPast = Boolean(slot.isPast)
              const isDisabled = Boolean(slot.disabled || isTaken || isPast)
              const displayLabel = formatSlotTime(slot)

              return (
                <button
                  key={slot.time}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    if (!isDisabled && onTimeChange) {
                      onTimeChange(slot.time)
                    }
                  }}
                  className={cn(
                    "w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-medium transition-all text-center flex items-center justify-center gap-1.5 relative",
                    // Selected state: Solid black rounded button with white text (matches image exactly)
                    isSelected
                      ? "bg-neutral-900 text-white font-semibold border border-neutral-900 shadow-xs"
                      : isDisabled
                      ? "bg-gray-50 border border-gray-200 text-gray-300 cursor-not-allowed line-through"
                      : "bg-white border border-gray-200 text-gray-800 hover:border-gray-300 hover:bg-gray-50 shadow-2xs cursor-pointer active:scale-[0.99]"
                  )}
                >
                  <span>{displayLabel}</span>
                  {isTaken && (
                    <span className="text-[10px] font-bold uppercase text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-sm ml-1.5 no-underline">
                      Booked
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Bottom Helper Info */}
        <div className="pt-3 text-center text-xs text-gray-400 border-t border-gray-100 mt-3">
          {selectedDate && selectedTime ? (
            <span className="text-gray-700 font-medium">
              Selected: <strong className="text-neutral-900">{selectedDate}</strong> at{" "}
              <strong className="text-neutral-900">{selectedTime}</strong>
            </span>
          ) : (
            <span>Select a date and time slot</span>
          )}
        </div>
      </div>
    </div>
  )
}

export default CalendarTimePicker
