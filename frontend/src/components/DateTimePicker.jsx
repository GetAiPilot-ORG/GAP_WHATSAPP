import React, { forwardRef } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Calendar, Clock, ChevronLeft, ChevronRight } from 'lucide-react';

const CustomInput = forwardRef(({ value, onClick, placeholder, className }, ref) => (
    <div className="relative w-full" onClick={onClick}>
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Calendar className="h-4 w-4 text-gray-400" />
        </div>
        <input
            ref={ref}
            value={value}
            placeholder={placeholder}
            className={`w-full rounded-lg border py-2.5 pl-9 pr-4 text-sm outline-none transition-all focus:ring-2 focus:ring-[#0070d1]/10 ${className}`}
            readOnly
        />
        {value && (
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <Clock className="h-4 w-4 text-[#0064b7]" />
            </div>
        )}
    </div>
));

export default function DateTimePicker({ value, onChange, placeholder = "Select date and time", className = "" }) {
    // value is expected to be an ISO string like "yyyy-MM-ddThh:mm" or null
    const dateValue = value ? new Date(value) : null;

    const handleChange = (date) => {
        if (!date) {
            onChange("");
            return;
        }
        // Keep local time but format it to ISO-like without the Z to match datetime-local expectation
        // e.g. "2026-07-29T16:00"
        const offset = date.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(date - offset)).toISOString().slice(0, 16);
        onChange(localISOTime);
    };

    return (
        <div className="custom-datepicker-wrapper relative w-full">
            <DatePicker
                selected={dateValue}
                onChange={handleChange}
                showTimeSelect
                timeFormat="h:mm aa"
                timeIntervals={15}
                timeCaption="Time"
                dateFormat="MMM d, yyyy h:mm aa"
                placeholderText={placeholder}
                customInput={<CustomInput className={className} />}
                minDate={new Date()}
                calendarClassName="!border !border-gray-200 !shadow-xl !rounded-xl !font-sans overflow-hidden"
                dayClassName={(date) => 
                    "!rounded-md hover:!bg-blue-50 !text-sm !font-medium"
                }
                timeClassName={(time) => "!text-sm !font-medium hover:!bg-blue-50"}
                renderCustomHeader={({
                    date,
                    decreaseMonth,
                    increaseMonth,
                    prevMonthButtonDisabled,
                    nextMonthButtonDisabled,
                }) => (
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50/50">
                        <span className="text-sm font-bold text-gray-800">
                            {date.toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </span>
                        <div className="flex gap-1">
                            <button
                                onClick={decreaseMonth}
                                disabled={prevMonthButtonDisabled}
                                type="button"
                                className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 transition"
                            >
                                <ChevronLeft className="h-4 w-4 text-gray-600" />
                            </button>
                            <button
                                onClick={increaseMonth}
                                disabled={nextMonthButtonDisabled}
                                type="button"
                                className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 transition"
                            >
                                <ChevronRight className="h-4 w-4 text-gray-600" />
                            </button>
                        </div>
                    </div>
                )}
            />
        </div>
    );
}
