import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center rounded-full pointer-coarse:after:absolute pointer-coarse:after:-inset-1 border border-transparent bg-clip-padding text-body font-medium whitespace-nowrap transition-all duration-150 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Stitch primary: black pill.
        default:
          "bg-primary text-primary-foreground shadow-sm hover:-translate-y-px hover:bg-primary/85 hover:shadow-[0_6px_18px_rgba(5,8,11,0.28)] dark:hover:shadow-[0_6px_18px_rgba(0,0,0,0.5)]",
        // Stitch secondary: white glass pill.
        outline:
          "bg-surface-container-lowest/85 text-on-surface shadow-sm ring-1 ring-black/[0.04] backdrop-blur-md hover:-translate-y-px hover:bg-surface-container-lowest hover:shadow-[0_6px_16px_rgba(14,26,36,0.12)] aria-expanded:bg-surface-container-lowest dark:bg-surface-container-high/70 dark:hover:bg-surface-container-highest",
        secondary:
          "bg-surface-container-low text-on-surface hover:bg-surface-container aria-expanded:bg-surface-container",
        ghost:
          "text-on-surface hover:bg-surface-container-lowest/90 hover:shadow-sm aria-expanded:bg-surface-container-lowest/90 dark:hover:bg-surface-container-high",
        destructive:
          "bg-error-container/70 text-on-error-container hover:bg-error-container focus-visible:ring-destructive/20 dark:bg-error-container/60 dark:hover:bg-error-container",
        // Stitch text action ("Show as table →").
        link: "text-on-tertiary-container underline-offset-4 hover:text-primary hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 px-2 text-small has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 px-3 text-body has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-1.5 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        // Stitch icon buttons are 12px-radius squares.
        icon: "size-9 rounded-xl",
        "icon-xs": "size-6 rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-xl",
        "icon-lg": "size-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
