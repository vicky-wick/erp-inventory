import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import { cn } from "./button";

/**
 * Uploaded logos live behind an authenticated JSON endpoint, so they cannot be
 * used directly in an <img src>. We fetch each file once, convert it to a data
 * URL and keep it in a module cache — every screen that shows the same logo
 * reuses that single request for the lifetime of the tab.
 */
const logoCache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

function loadLogo(path: string): Promise<string | null> {
  const cached = logoCache.get(path);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(path);
  if (existing) return existing;

  const promise = get<{ mime_type: string; data_base64: string }>(path.replace(/^\/api/, ""))
    .then((file) => {
      const src = `data:${file.mime_type};base64,${file.data_base64}`;
      logoCache.set(path, src);
      return src;
    })
    .catch(() => null)
    .finally(() => pending.delete(path));

  pending.set(path, promise);
  return promise;
}

export function useWorkspaceLogo(logoUrl: string | null | undefined): string | null {
  const inline = typeof logoUrl === "string" && logoUrl.startsWith("data:image/") ? logoUrl : null;
  const file = logoUrl && !inline ? logoUrl : null;
  const [src, setSrc] = useState<string | null>(
    inline ?? (file ? logoCache.get(file) ?? null : null)
  );

  useEffect(() => {
    if (inline) {
      setSrc(inline);
      return;
    }
    if (!file) {
      setSrc(null);
      return;
    }
    const cached = logoCache.get(file);
    if (cached) {
      setSrc(cached);
      return;
    }
    let alive = true;
    setSrc(null);
    void loadLogo(file).then((url) => {
      if (alive) setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [inline, file]);

  return src;
}

export function WorkspaceLogo({
  name,
  logoUrl,
  size = 36,
  className,
  imageClassName,
}: {
  name: string;
  logoUrl: string | null | undefined;
  size?: number;
  className?: string;
  imageClassName?: string;
}) {
  const src = useWorkspaceLogo(logoUrl);
  const initial = (name.trim()[0] ?? "E").toUpperCase();

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-[10px]",
        src ? "border border-line/70 bg-surface" : "bg-charcoal",
        className
      )}
      style={{ height: size, width: size }}
    >
      {src ? (
        <img
          src={src}
          alt={`${name} logo`}
          className={cn("h-full w-full object-contain", imageClassName)}
          draggable={false}
        />
      ) : (
        <span
          className="font-display font-semibold text-gold"
          style={{ fontSize: Math.round(size * 0.44) }}
          aria-hidden
        >
          {initial}
        </span>
      )}
    </div>
  );
}
