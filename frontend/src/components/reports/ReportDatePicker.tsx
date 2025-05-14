"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface ReportDatePickerProps {
  onChange: (range: { startDate: string; endDate: string }) => void;
  defaultMonth?: Date;
  defaultRange?: DateRange;
  className?: string;
}

export function ReportDatePicker({
  onChange,
  defaultMonth,
  defaultRange,
  className,
}: ReportDatePickerProps) {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(defaultRange);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const handleDateChange = (range: DateRange | undefined) => {
    setDateRange(range);
    
    if (range?.from && range?.to) {
      // Format dates for API (YYYY-MM-DD)
      onChange({
        startDate: format(range.from, "yyyy-MM-dd"),
        endDate: format(range.to, "yyyy-MM-dd"),
      });
      
      // Close the calendar after selection
      setIsCalendarOpen(false);
    }
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="outline"
            className={cn(
              "w-[300px] justify-start text-left font-normal",
              !dateRange && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateRange?.from && dateRange.from instanceof Date && !isNaN(dateRange.from.getTime()) ? (
              dateRange.to && dateRange.to instanceof Date && !isNaN(dateRange.to.getTime()) ? (
                <>
                  {format(dateRange.from, "LLL d, yyyy")} -{" "}
                  {format(dateRange.to, "LLL d, yyyy")}
                </>
              ) : (
                format(dateRange.from, "LLL d, yyyy")
              )
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={defaultMonth || dateRange?.from}
            selected={dateRange}
            onSelect={handleDateChange}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
