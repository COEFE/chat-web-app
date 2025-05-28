"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { JournalEntry } from "./JournalTable";

// Define form schema with zod
const recurringJournalSchema = z.object({
  journalId: z.number({
    required_error: "Journal entry is required",
  }),
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"], {
    required_error: "Frequency is required",
  }),
  startDate: z.date({
    required_error: "Start date is required",
  }),
  endDate: z.date().optional(),
  dayOfMonth: z.string().optional(),
  dayOfWeek: z.string().optional(),
});

type RecurringJournalFormValues = z.infer<typeof recurringJournalSchema>;

interface RecurringJournalFormProps {
  journal: JournalEntry;
  onSubmit: (values: RecurringJournalFormValues) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function RecurringJournalForm({
  journal,
  onSubmit,
  onCancel,
  isSubmitting,
}: RecurringJournalFormProps) {
  const [frequency, setFrequency] = useState<string>("monthly");

  // Initialize form with default values
  const form = useForm<RecurringJournalFormValues>({
    resolver: zodResolver(recurringJournalSchema),
    defaultValues: {
      journalId: journal.id,
      frequency: "monthly",
      startDate: new Date(),
      dayOfMonth: "1",
    },
  });

  // Handle form submission
  const handleSubmit = (values: RecurringJournalFormValues) => {
    onSubmit(values);
  };

  // Handle frequency change
  const handleFrequencyChange = (value: string) => {
    setFrequency(value);
    form.setValue("frequency", value as any);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="space-y-4">
          {/* Journal Info */}
          <div className="border rounded-md p-4 bg-muted/20">
            <h3 className="text-sm font-medium mb-2">Journal Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-muted-foreground">Date:</span>
                <p>{journal.date ? format(new Date(journal.date), "MMM d, yyyy") : 'No date'}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Amount:</span>
                <p>
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                  }).format(journal.total_amount || 0)}
                </p>
              </div>
              <div className="col-span-2">
                <span className="text-sm text-muted-foreground">Memo:</span>
                <p>{journal.memo}</p>
              </div>
            </div>
          </div>

          {/* Frequency Field */}
          <FormField
            control={form.control}
            name="frequency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Frequency</FormLabel>
                <Select
                  onValueChange={(value) => handleFrequencyChange(value)}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  How often this journal entry should recur
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Start Date Field */}
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Start Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) =>
                        date < new Date()
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormDescription>
                  When the recurring journal entries should start
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* End Date Field */}
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>End Date (Optional)</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>No end date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) =>
                        date <= form.getValues("startDate")
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormDescription>
                  When the recurring journal entries should end (leave blank for indefinite)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Day of Month Field (for monthly/quarterly/yearly) */}
          {frequency !== "weekly" && (
            <FormField
              control={form.control}
              name="dayOfMonth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Day of Month</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select day of month" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                        <SelectItem key={day} value={day.toString()}>
                          {day}
                        </SelectItem>
                      ))}
                      <SelectItem value="last">Last day of month</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Which day of the month the journal entry should be created
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Day of Week Field (for weekly) */}
          {frequency === "weekly" && (
            <FormField
              control={form.control}
              name="dayOfWeek"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Day of Week</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select day of week" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="0">Sunday</SelectItem>
                      <SelectItem value="1">Monday</SelectItem>
                      <SelectItem value="2">Tuesday</SelectItem>
                      <SelectItem value="3">Wednesday</SelectItem>
                      <SelectItem value="4">Thursday</SelectItem>
                      <SelectItem value="5">Friday</SelectItem>
                      <SelectItem value="6">Saturday</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Which day of the week the journal entry should be created
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        {/* Form Actions */}
        <div className="flex justify-end space-x-2">
          <Button variant="outline" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Setting Up..." : "Set Up Recurring Journal"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
