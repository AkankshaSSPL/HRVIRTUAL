import { SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/ui-system/SearchBar";

type FilterBarProps = {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  actions?: ReactNode;
};

export function FilterBar({ search, onSearchChange, searchPlaceholder, actions }: FilterBarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <SearchBar
        value={search}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
        className="max-w-xl"
      />
      <div className="flex items-center gap-2">
        <Button variant="outline" type="button">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
        </Button>
        {actions}
      </div>
    </div>
  );
}

