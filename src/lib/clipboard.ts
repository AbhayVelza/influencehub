import { toast } from 'sonner'

export async function copyToClipboard(text: string, label = 'Copied') {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(label, { description: text })
  } catch {
    toast.error('Couldn’t copy to the clipboard')
  }
}
