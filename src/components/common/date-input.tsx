import { CalendarDays } from 'lucide-react'
import { useRef, useState, type ComponentProps, type Ref } from 'react'
import { Calendar } from '@/components/common/calendar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DATE_INPUT_FORMAT, DATE_TIME_INPUT_FORMAT, dayToInput, parseDateInput, withPickedDay } from '@/lib/format'

// Text inputs, not <input type="date">: the browser would show the date in the user's locale instead of dd/MM/yyyy.
// Read the text with `parseDateInput` / `parseDateTimeInput` (lib/format.ts), usually through a zod schema.

type InputProps = Omit<ComponentProps<typeof Input>, 'type'>

interface PickerProps {
  /** Shows a calendar button; picking a day hands over the input's new text (e.g. to react-hook-form's setValue). */
  onPick?: (text: string) => void
  /** The first day that can be picked (yyyy-MM-dd), e.g. today for a follow-up. */
  minDay?: string
}

function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value)
  else if (ref) (ref as { current: T | null }).current = value
}

/** The text input, plus a calendar button when `onPick` is given. */
function PickableInput({ onPick, minDay, toText, ref, className, ...props }: InputProps & PickerProps & { toText: (current: string, day: string) => string }) {
  const input = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const field = (
    <Input
      type="text"
      autoComplete="off"
      {...props}
      ref={(el) => {
        input.current = el
        setRef(ref, el)
      }}
      className={onPick ? `pr-10 ${className ?? ''}` : className}
    />
  )
  if (!onPick) return field
  return (
    <div className="relative">
      {field}
      <Popover
        open={open}
        onOpenChange={(next) => {
          // The day already typed (the date part of a date-time) opens selected.
          if (next) setSelected(parseDateInput((input.current?.value ?? '').split(',')[0].trim()))
          setOpen(next)
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={props.disabled}
            aria-label="Open calendar"
            className="absolute top-1/2 right-0.5 -translate-y-1/2 text-muted-foreground hover:text-primary"
          >
            <CalendarDays />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-3">
          <Calendar
            selected={selected}
            min={minDay}
            onSelect={(day) => {
              onPick(toText(input.current?.value ?? '', day))
              setOpen(false)
              input.current?.focus()
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** A date typed as dd/MM/yyyy, or picked on the calendar (`onPick`). */
export function DateInput(props: InputProps & PickerProps) {
  return <PickableInput inputMode="numeric" placeholder={DATE_INPUT_FORMAT} toText={(_, day) => dayToInput(day)} {...props} />
}

/** A date and time typed as dd/MM/yyyy, hh:mm a (Asia/Kolkata); the calendar sets the day and keeps the time. */
export function DateTimeInput(props: InputProps & PickerProps) {
  return <PickableInput placeholder={DATE_TIME_INPUT_FORMAT} toText={withPickedDay} {...props} />
}
