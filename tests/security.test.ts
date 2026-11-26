import { describe, expect, it } from 'vitest'
import { csvCell } from '@/lib/csv'
import { matchesContentType } from '@/lib/documents'
import { setPasswordSchema } from '@/lib/schemas'

// Security hardening (docs/server.md, "Security").
describe('Security', () => {
  it('CSV exports neutralise formulas but keep phone numbers and negative numbers', () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`)
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell('+cmd|calc')).toBe("'+cmd|calc")
    expect(csvCell('-2+3+cmd')).toBe("'-2+3+cmd")
    expect(csvCell('+91 98765 43210')).toBe('+91 98765 43210')
    expect(csvCell('-12.5')).toBe('-12.5')
    expect(csvCell('Riya')).toBe('Riya')
  })

  it('uploads must really be the type they claim', () => {
    const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0])
    expect(matchesContentType(bytes(0x25, 0x50, 0x44, 0x46), 'application/pdf')).toBe(true)
    expect(matchesContentType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'image/png')).toBe(true)
    expect(matchesContentType(bytes(0xff, 0xd8, 0xff), 'image/jpeg')).toBe(true)
    expect(matchesContentType(bytes(0x50, 0x4b, 0x03, 0x04), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true)
    expect(matchesContentType(new TextEncoder().encode('<html><script>alert(1)</script>'), 'image/png')).toBe(false)
    expect(matchesContentType(bytes(0x25, 0x50, 0x44, 0x46), 'text/html')).toBe(false)
  })

  it('passwords are 8 to 200 characters', () => {
    const ok = (password: string) => setPasswordSchema.safeParse({ password }).success
    expect(ok('short')).toBe(false)
    expect(ok('long enough')).toBe(true)
    expect(ok('x'.repeat(201))).toBe(false)
  })
})
