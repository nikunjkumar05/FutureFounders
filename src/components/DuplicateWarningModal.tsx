import { X } from 'lucide-react';
import type { Customer, DuplicateMatchType } from '../lib/types';

const titles: Record<DuplicateMatchType, string> = {
  exact: 'Possible Duplicate Customer',
  phone_only: 'Phone Number Already Exists',
  name_only: 'Customer Name Already Exists',
};

const messages: Record<DuplicateMatchType, string> = {
  exact: 'A customer with the same name and phone number already exists.',
  phone_only: 'This phone number is already used by another customer.',
  name_only: 'A customer with this name already exists.',
};

export default function DuplicateWarningModal({
  customer,
  matchType,
  onCancel,
  onConfirm,
}: {
  customer: Customer;
  matchType: DuplicateMatchType;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-navy-900/30 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-surface-700 rounded-xl w-full max-w-sm shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-white">{titles[matchType]}</h2>
          <button onClick={onCancel} className="text-surface-400 dark:text-surface-500 hover:text-surface-600 dark:hover:text-surface-300">
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-surface-600 dark:text-surface-300 mb-3">{messages[matchType]}</p>
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-lg p-3 mb-4">
          <p className="text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Existing customer</p>
          <p className="text-sm font-medium text-surface-900 dark:text-white">Name: {customer.name}</p>
          <p className="text-sm text-surface-700 dark:text-surface-200">Phone: {customer.phone}</p>
        </div>
        <p className="text-sm text-surface-600 dark:text-surface-300 mb-4">
          Do you still want to create another customer?
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-600 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 transition-colors">
            Create Anyway
          </button>
        </div>
      </div>
    </div>
  );
}
