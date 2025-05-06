"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface JournalSearchProps {
  onSearch: (searchParams: JournalSearchParams) => void;
}

export interface JournalSearchParams {
  searchTerm: string;
  searchField: string;
}

export function JournalSearch({ onSearch }: JournalSearchProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchField, setSearchField] = useState("memo");

  const handleSearch = () => {
    onSearch({
      searchTerm,
      searchField,
    });
  };

  const handleClear = () => {
    setSearchTerm("");
    setSearchField("memo");
    onSearch({
      searchTerm: "",
      searchField: "memo",
    });
  };

  return (
    <div className="flex items-center space-x-2">
      <div className="relative flex-grow">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search journals..."
          className="pl-8"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSearch();
            }
          }}
        />
        {searchTerm && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-3"
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Clear</span>
          </Button>
        )}
      </div>
      <Select
        value={searchField}
        onValueChange={setSearchField}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Search field" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="memo">Memo</SelectItem>
          <SelectItem value="source">Source</SelectItem>
          <SelectItem value="created_by">Created By</SelectItem>
        </SelectContent>
      </Select>
      <Button onClick={handleSearch}>Search</Button>
    </div>
  );
}
