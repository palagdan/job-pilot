import { toast } from '../../../components/ui/toast.tsx';

/** Copies text to the clipboard and confirms with a toast. Falls back to a hidden textarea on insecure origins. */
export async function copyText(text: string, message = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) {
      toast.error('Could not copy. Select the text and copy it by hand.');
      return;
    }
  }
  toast(message);
}
