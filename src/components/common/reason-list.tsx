const MAX_SHOWN = 5

/** Per-row reasons for a toast description, capped so long lists stay readable. */
export function ReasonList({ reasons }: { reasons: string[] }) {
  const shown = reasons.slice(0, MAX_SHOWN)
  const rest = reasons.length - shown.length
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-4">
      {shown.map((reason, i) => (
        <li key={i}>{reason}</li>
      ))}
      {rest > 0 && <li className="list-none">…and {rest} more</li>}
    </ul>
  )
}
