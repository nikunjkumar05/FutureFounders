import { useState, useRef, useEffect } from 'react';
import { Contact, ChevronDown, ClipboardPaste, Smartphone } from 'lucide-react';

interface ContactPickerProps {
  onSelect: (contact: { name: string; phone: string }) => void;
  label?: string;
}

type SupportStatus = 'checking' | 'supported' | 'unsupported';

interface ContactInfo {
  name: string[];
  tel: string[];
}

export default function ContactPicker({ onSelect, label = 'Select From Contacts' }: ContactPickerProps) {
  const [supportStatus, setSupportStatus] = useState<SupportStatus>('checking');
  const [showMenu, setShowMenu] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteInput, setPasteInput] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nav = navigator as unknown as { contacts?: { select: (props: string[], opts: { multiple: boolean }) => Promise<unknown[]> } };
    if (typeof nav.contacts?.select === 'function') {
      setSupportStatus('supported');
    } else {
      setSupportStatus('unsupported');
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNativePicker = async () => {
    try {
      const nav = navigator as unknown as { contacts: { select: (props: string[], opts: { multiple: boolean }) => Promise<ContactInfo[]> } };
      const props = await nav.contacts.select(['name', 'tel'], { multiple: false });
      if (props && props.length > 0) {
        const contact = props[0];
        const name = contact.name?.[0] ?? '';
        const phone = contact.tel?.[0] ?? '';
        if (name || phone) {
          onSelect({
            name: name,
            phone: phone.replace(/[\s\-\(\)]/g, ''),
          });
        }
      }
    } catch {
      // User cancelled or error — fall through silently
    }
    setShowMenu(false);
  };

  const handlePasteSubmit = () => {
    const text = pasteInput.trim();
    if (!text) return;

    const lines = text.split('\n').filter(Boolean);
    let name = '';
    let phone = '';

    if (lines.length === 1) {
      phone = lines[0].replace(/[\s\-\(\)]/g, '');
    } else {
      name = lines[0].trim();
      phone = lines[1].replace(/[\s\-\(\)]/g, '');
    }

    onSelect({ name, phone });
    setPasteInput('');
    setShowPaste(false);
    setShowMenu(false);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setPasteInput(text);
        setShowPaste(true);
      }
    } catch {
      setShowPaste(true);
    }
  };

  if (supportStatus === 'checking') return null;

  const canUseNative = supportStatus === 'supported';

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-1.5 text-xs font-display font-medium text-navy-600 dark:text-cyan-400 hover:text-navy-700 dark:hover:text-cyan-300 bg-navy-50 dark:bg-cyan-950/50 hover:bg-navy-100 dark:hover:bg-cyan-900/50 px-3 py-1.5 rounded-lg transition-colors"
      >
        <Contact size={14} />
        {label}
        <ChevronDown size={12} className={`transition-transform ${showMenu ? 'rotate-180' : ''}`} />
      </button>

      {showMenu && (
        <div className="absolute top-full mt-1 left-0 z-50 w-64 bg-white dark:bg-surface-700 rounded-xl shadow-lg border border-surface-200 dark:border-surface-600 overflow-hidden">
          {canUseNative && (
            <button
              type="button"
              onClick={handleNativePicker}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-600 transition-colors text-left"
            >
              <Smartphone size={16} className="text-navy-500 shrink-0" />
              <div>
                <p className="font-medium">Choose from phone contacts</p>
                <p className="text-xs text-surface-400 dark:text-surface-500">Opens your device contact list</p>
              </div>
            </button>
          )}

          <button
            type="button"
            onClick={handlePasteFromClipboard}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-600 transition-colors text-left border-t border-surface-100 dark:border-surface-600"
          >
            <ClipboardPaste size={16} className="text-navy-500 shrink-0" />
            <div>
              <p className="font-medium">Paste contact details</p>
              <p className="text-xs text-surface-400 dark:text-surface-500">Paste name and phone number</p>
            </div>
          </button>
        </div>
      )}

      {showPaste && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-900/30 backdrop-blur-sm" onClick={() => { setShowPaste(false); setShowMenu(false); }}>
          <div className="bg-white dark:bg-surface-700 rounded-xl w-full max-w-sm shadow-xl p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-100 mb-1">Paste Contact Details</h3>
            <p className="text-xs text-surface-500 dark:text-surface-400 mb-3">
              Paste a name and phone number. Use one line or two: first line name, second line number.
            </p>
            <textarea
              value={pasteInput}
              onChange={e => setPasteInput(e.target.value)}
              placeholder={`Ravi Kumar\n9876543210`}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 dark:bg-surface-600 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none mb-3"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowPaste(false); setShowMenu(false); }}
                className="px-3 py-2 rounded-lg text-sm font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePasteSubmit}
                disabled={!pasteInput.trim()}
                className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-navy-600 hover:bg-navy-700 transition-colors disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
