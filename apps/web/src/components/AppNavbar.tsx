import type { AppTab } from "../types/flow";
import { ThemeToggle } from "./ThemeToggle";

/** The three top-level navigation tabs and their display labels. */
const TAB_ITEMS: { value: AppTab; label: string }[] = [
  { value: "generate", label: "Generate" },
  { value: "library", label: "Library" },
  { value: "editor", label: "Editor" },
];

export interface AppNavbarProps {
  /** The currently active tab. */
  tab: AppTab;
  /**
   * Called when the user clicks a tab button.
   * The parent is responsible for clearing selection state before switching.
   */
  onTabChange: (tab: AppTab) => void;
}

export function AppNavbar({ tab, onTabChange }: AppNavbarProps) {
  return (
    <div className="flex items-center gap-3 px-4 h-[52px] bg-navbar border-b border-navbar-border">
      <nav className="flex items-center gap-1 bg-muted rounded-lg p-1">
        {TAB_ITEMS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onTabChange(t.value)}
            className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-all ${
              tab === t.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/60"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="ml-auto" />
      <ThemeToggle />
    </div>
  );
}
