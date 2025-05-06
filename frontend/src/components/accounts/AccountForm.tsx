"use client";

import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
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
import { Textarea } from "@/components/ui/textarea";
import { AccountNode } from "./AccountTree";

// Define form schema
const accountFormSchema = z.object({
  code: z
    .string()
    .min(3, { message: "Account code must be at least 3 characters." })
    .max(50, { message: "Account code must not exceed 50 characters." })
    .regex(/^[0-9]+$/, { message: "Account code must contain only numbers." }),
  name: z
    .string()
    .min(2, { message: "Account name must be at least 2 characters." })
    .max(100, { message: "Account name must not exceed 100 characters." }),
  parent_id: z.string().nullable(),
  notes: z.string().nullable().optional(),
});

type AccountFormValues = z.infer<typeof accountFormSchema>;

interface AccountFormProps {
  account?: AccountNode;
  parentId?: number | null;
  availableParents: AccountNode[];
  onSubmit: (values: AccountFormValues) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function AccountForm({
  account,
  parentId,
  availableParents,
  onSubmit,
  onCancel,
  isSubmitting,
}: AccountFormProps) {
  // Convert the flat array of accounts into a format suitable for the select dropdown
  const parentOptions = availableParents.map((parent) => ({
    value: parent.id.toString(),
    label: `${parent.code} - ${parent.name}`,
  }));

  // Add a "No Parent" option
  parentOptions.unshift({ value: "none", label: "No Parent (Root Account)" });

  // Initialize form with default values or existing account values
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: account
      ? {
          code: account.code,
          name: account.name,
          parent_id: account.parent_id ? account.parent_id.toString() : "",
          notes: account.notes || "",
        }
      : {
          code: "",
          name: "",
          parent_id: parentId ? parentId.toString() : "",
          notes: "",
        },
  });

  // Handle form submission
  const handleSubmit = (values: AccountFormValues) => {
    onSubmit({
      ...values,
      parent_id: values.parent_id && values.parent_id !== "none" ? values.parent_id : null,
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Account Code</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. 1000" {...field} />
                </FormControl>
                <FormDescription>
                  Numeric code for the account (e.g., 1000 for Assets)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Account Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Cash" {...field} />
                </FormControl>
                <FormDescription>
                  Descriptive name for the account
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="parent_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Parent Account</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value || "none"}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a parent account" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {parentOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Parent account in the chart of accounts hierarchy
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Optional notes about this account"
                  className="resize-none"
                  {...field}
                  value={field.value || ""}
                />
              </FormControl>
              <FormDescription>
                Additional information about the account (optional)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-2">
          <Button variant="outline" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : account ? "Update Account" : "Create Account"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
