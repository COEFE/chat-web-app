"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface AsOfDatePickerProps {
  onChange: (date: string) => void;
  defaultDate?: Date;
  className?: string;
}

export function AsOfDatePicker({
  onChange,
  defaultDate = new Date(),
  className,
}: AsOfDatePickerProps) {
  const [date, setDate] = useState<Date | undefined>(defaultDate);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const handleDateChange = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    
    if (selectedDate) {
      // Format date for API (YYYY-MM-DD)
      onChange(format(selectedDate, "yyyy-MM-dd"));
      
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
              "w-[240px] justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date && date instanceof Date && !isNaN(date.getTime()) 
              ? format(date, "MMMM d, yyyy") 
              : <span>Pick a date</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="single"
            defaultMonth={date}
            selected={date}
            onSelect={handleDateChange}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
