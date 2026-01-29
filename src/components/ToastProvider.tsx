import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "info" | "success" | "warning" | "error";

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
}

interface Toast extends ToastInput {
  id: string;
}

interface ToastContextValue {
  notify: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toneStyles: Record<ToastTone, string> = {
  info: "border-border/60 bg-card/90",
  success: "border-emerald-500/30 bg-emerald-500/10",
  warning: "border-amber-400/30 bg-amber-400/10",
  error: "border-red-500/30 bg-red-500/10",
};

const toneAccent: Record<ToastTone, string> = {
  info: "text-foreground",
  success: "text-emerald-400",
  warning: "text-amber-300",
  error: "text-red-400",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (toast: ToastInput) => {
      const id = `${Date.now()}-${counter.current++}`;
      const entry: Toast = {
        id,
        tone: "info",
        durationMs: 4200,
        ...toast,
      };
      setToasts((prev) => [...prev, entry]);

      if (entry.durationMs && entry.durationMs > 0) {
        window.setTimeout(() => removeToast(id), entry.durationMs);
      }
    },
    [removeToast],
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<{ game_id: string; game_name: string }>(
        "game:save-path-missing",
        (event) => {
          const name = event.payload?.game_name || "";
          notify({
            tone: "warning",
            title: "\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u044b",
            description: `\u0414\u043b\u044f \"${name}\" \u043d\u0435 \u043d\u0430\u0448\u043b\u0438 \u043f\u0443\u0442\u044c \u043a \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f\u043c. \u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0435\u0433\u043e \u0432 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430\u0445 \u0438\u0433\u0440\u044b, \u0447\u0442\u043e\u0431\u044b \u0440\u0430\u0431\u043e\u0442\u0430\u043b\u0438 \u0431\u044d\u043a\u0430\u043f\u044b.`,
          });
        },
      );
    };
    setup();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [notify]);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-3 px-4 lg:px-0">
        {toasts.map((toast) => {
          const tone = toast.tone ?? "info";
          return (
            <div
              key={toast.id}
              className={cn(
                "pointer-events-auto rounded-2xl border px-4 py-3 shadow-[0_18px_40px_rgba(8,12,24,0.45)] backdrop-blur-xl",
                toneStyles[tone],
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className={cn("text-sm font-semibold", toneAccent[tone])}>
                    {toast.title}
                  </div>
                  {toast.description && (
                    <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {toast.description}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => removeToast(toast.id)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
