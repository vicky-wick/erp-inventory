import { PackageOpen, SearchX, WifiOff } from "lucide-react";
import { cn } from "./button";

export function EmptyState({
  icon,
  title,
  message,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-background-2 text-muted-foreground">
        {icon ?? <PackageOpen size={24} />}
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {message && <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function NoResults({ message = "No matching results found." }: { message?: string }) {
  return (
    <EmptyState
      icon={<SearchX size={24} />}
      title="Nothing here"
      message={message}
    />
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={<WifiOff size={24} />}
      title="Couldn't load your data"
      message={message ?? "Check your connection and try again."}
      action={
        onRetry && (
          <button
            onClick={onRetry}
            className="h-10 rounded-md border border-line bg-surface px-4 text-sm font-medium hover:bg-background-2"
          >
            Try again
          </button>
        )
      }
    />
  );
}
