import { Phone } from 'lucide-react';
import { formatTelUri } from '../lib/phone';

interface PhoneLinkProps {
  phone: string;
}

export function PhoneLink({ phone }: PhoneLinkProps) {
  if (!phone || phone.trim() === '') {
    return (
      <span className="font-mono text-surface-600 dark:text-surface-300 flex items-center gap-1 text-xs">
        <Phone size={12} />
        {phone}
      </span>
    );
  }

  return (
    <a
      href={`tel:${formatTelUri(phone)}`}
      title="Call customer"
      className="font-mono text-surface-600 dark:text-surface-300 flex items-center gap-1 text-xs hover:text-navy-600 dark:hover:text-navy-400 cursor-pointer transition-colors"
    >
      <Phone size={12} />
      {phone}
    </a>
  );
}
