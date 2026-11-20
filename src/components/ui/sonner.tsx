import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"
import { useTheme } from "@/hooks/use-theme"

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "color-mix(in srgb, var(--surface-container-lowest) 92%, transparent)",
          "--normal-text": "var(--on-surface)",
          "--normal-border": "transparent",
          "--border-radius": "1rem",
        } as React.CSSProperties
      }
      toastOptions={{
        // Stitch glass toast; the type reads from the icon colour.
        classNames: {
          toast:
            "cn-toast !rounded-2xl !shadow-[0_16px_40px_rgba(14,26,36,0.12)] backdrop-blur-2xl ring-1 ring-black/5 dark:ring-white/8",
          title: "!text-label-md !font-semibold",
          description: "!text-body-sm !text-muted-foreground",
          success: "[&_[data-icon]]:text-emerald-600 dark:[&_[data-icon]]:text-emerald-400",
          error: "[&_[data-icon]]:text-error",
          warning: "[&_[data-icon]]:text-amber-600 dark:[&_[data-icon]]:text-amber-400",
          info: "[&_[data-icon]]:text-on-tertiary-container",
          closeButton: "!bg-surface-container-lowest !border-surface-container",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
