import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type LabelHTMLAttributes } from "react";
import { cn } from "./button";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-11 w-full rounded-md border bg-surface px-3 text-base text-foreground placeholder:text-muted-foreground/70",
          "transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-champagne/40",
          invalid ? "border-danger focus:ring-danger/30" : "border-line focus:border-champagne",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className
        )}
        {...props}
      />
    );
  }
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-[88px] w-full rounded-md border border-line bg-surface px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground/70",
          "transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-champagne/40 focus:border-champagne",
          className
        )}
        {...props}
      />
    );
  }
);

export function Label({ className, children, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("mb-1.5 block text-sm font-medium text-foreground", className)} {...props}>
      {children}
    </label>
  );
}

export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="mt-1 text-2xs text-danger">{message}</p>;
}

export function Field({
  label,
  error,
  hint,
  children,
  optional,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Label>{label}</Label>
        {optional && <span className="mb-1.5 text-2xs text-muted-foreground">Optional</span>}
      </div>
      {children}
      {hint && !error && <p className="mt-1 text-2xs text-muted-foreground">{hint}</p>}
      <FieldError message={error} />
    </div>
  );
}
