import type { ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { DATE_INPUT_FORMAT, DATE_TIME_INPUT_FORMAT } from '@/lib/format'

// Text inputs, not <input type="date">: the browser would show the date in the user's locale instead of dd/MM/yyyy.
// Read the text with `parseDateInput` / `parseDateTimeInput` (lib/format.ts), usually through a zod schema.

/** A date typed as dd/MM/yyyy. */
export function DateInput(props: Omit<ComponentProps<typeof Input>, 'type'>) {
  return <Input type="text" inputMode="numeric" autoComplete="off" placeholder={DATE_INPUT_FORMAT} {...props} />
}

/** A date and time typed as dd/MM/yyyy, hh:mm a (Asia/Kolkata). */
export function DateTimeInput(props: Omit<ComponentProps<typeof Input>, 'type'>) {
  return <Input type="text" autoComplete="off" placeholder={DATE_TIME_INPUT_FORMAT} {...props} />
}
