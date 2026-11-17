import { Loader2 } from "lucide-react";

export function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-charcoal">
          <span className="font-display text-lg font-semibold text-gold">E</span>
        </div>
        <Loader2 size={18} className="animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
