import { useState } from 'react';
import { Plus, Package, X, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { useInventory, useAddInventory, useUpdateInventory, useDeleteInventory, useStockAlerts, useResolveAlert, useResolvedAlerts } from '../lib/queries';
import { CardSkeleton } from '../components/LoadingSkeleton';
import type { Inventory } from '../lib/types';

export default function Inventory() {
  const { data: inventory, isLoading } = useInventory();
  const { data: alerts } = useStockAlerts();
  const { data: reorderedIds } = useResolvedAlerts();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editItem, setEditItem] = useState<Inventory | null>(null);
  const [showAlertHistory, setShowAlertHistory] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-display-lg font-display text-surface-900 dark:text-surface-100">Supplies</h1>
          <p className="text-body-sm text-surface-500 dark:text-surface-400 mt-1">
            Track chemical supplies and stock levels
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary"
        >
          <Plus size={16} />
          Add item
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : !inventory?.length ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {inventory.map((item) => {
            const ratio = item.current_stock / (item.minimum_threshold * 3);
            const status =
              item.current_stock < item.minimum_threshold
                ? (reorderedIds?.has(item.id) ? 'reordered' : 'critical')
                : item.current_stock < item.minimum_threshold * 2
                ? 'low'
                : 'ok';
            const barColor =
              status === 'critical'
                ? 'bg-red-500'
                : status === 'low'
                ? 'bg-red-400'
                : status === 'reordered'
                ? 'bg-cyan-500'
                : 'bg-cyan-500';
            const badgeLabel =
              status === 'critical'
                ? 'Critical'
                : status === 'low'
                ? 'Low'
                : status === 'reordered'
                ? 'Reordered'
                : 'OK';

            return (
              <div
                key={item.id}
                className="card-base p-5"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-surface-100 dark:bg-surface-700">
                      <Package size={18} className="text-surface-600 dark:text-surface-300" />
                    </div>
                    <div>
                      <h3 className="font-display font-semibold text-surface-900 dark:text-surface-100">
                        {item.item_name}
                      </h3>
                      <p className="text-body-xs text-surface-500 dark:text-surface-400">
                        Per {item.unit}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditItem(item)}
                      className="btn-ghost p-1.5"
                      title="Edit item"
                    >
                      <Pencil size={14} />
                    </button>
                    <DeleteButton itemId={item.id} itemName={item.item_name} />
                    <span className={
                      status === 'critical' ? 'badge-warn'
                        : status === 'low' ? 'badge-warn'
                        : status === 'reordered' ? 'badge-info'
                        : 'badge-ok'
                    }>
                      {badgeLabel}
                    </span>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-body-xs text-surface-500 dark:text-surface-400 mb-1.5">
                    <span className="font-mono">
                      {item.current_stock}{item.unit}
                    </span>
                    <span className="font-mono">
                      min: {item.minimum_threshold}{item.unit}
                    </span>
                  </div>
                  <div className="h-2.5 bg-surface-100 dark:bg-surface-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor}`}
                      style={{
                        width: `${Math.min(ratio * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="text-body-xs text-surface-500 dark:text-surface-400 font-mono">
                  Max ref: {(item.minimum_threshold * 3).toFixed(0)}{item.unit}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Alert History */}
      {alerts && alerts.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowAlertHistory(!showAlertHistory)}
            className="flex items-center gap-2 text-sm font-medium text-surface-600 dark:text-surface-200 hover:text-surface-900 dark:hover:text-white mb-3"
          >
            <AlertTriangle size={14} className="text-amber-500" />
            Stock Alert History
            <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {alerts.length}
            </span>
          </button>
          {showAlertHistory && <AlertHistoryTable />}
        </div>
      )}

      {showAddModal && <AddItemModal onClose={() => setShowAddModal(false)} />}
      {editItem && <EditItemModal item={editItem} onClose={() => setEditItem(null)} />}
    </div>
  );
}

function DeleteButton({ itemId, itemName }: { itemId: string; itemName: string }) {
  const [confirming, setConfirming] = useState(false);
  const del = useDeleteInventory();

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={() => {
            del.mutate({ id: itemId });
            setConfirming(false);
          }}
          className="text-[10px] font-medium text-red-700 bg-red-50 hover:bg-red-100 px-1.5 py-0.5 rounded transition-colors"
        >
          Sure?
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-[10px] text-surface-400 dark:text-surface-500 hover:text-surface-600 dark:hover:text-surface-300"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="p-1.5 rounded-lg text-surface-400 dark:text-surface-500 hover:text-red-600 hover:bg-red-50 transition-colors"
      title={`Delete ${itemName}`}
    >
      <Trash2 size={14} />
    </button>
  );
}

function AlertHistoryTable() {
  const { data: alerts } = useStockAlerts();
  const resolveAlert = useResolveAlert();

  return (
    <div className="bg-white dark:bg-surface-700 rounded-xl border border-surface-200 dark:border-surface-600 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-100 dark:border-surface-600/50 bg-surface-50 dark:bg-surface-900/50">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase">
              Item
            </th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase">
              Current Stock
            </th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase">
              Min Threshold
            </th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase">
              Created
            </th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100 dark:divide-surface-600/50">
          {alerts?.map((alert) => (
            <tr key={alert.id} className="hover:bg-surface-50 dark:hover:bg-surface-600/50">
              <td className="px-4 py-2.5 font-medium text-surface-900 dark:text-white">
                {alert.inventory?.item_name}
              </td>
              <td className="px-4 py-2.5 text-red-600 font-medium">
                {alert.inventory?.current_stock}
                {alert.inventory?.unit}
              </td>
              <td className="px-4 py-2.5 text-surface-500 dark:text-surface-400">
                {alert.inventory?.minimum_threshold}
                {alert.inventory?.unit}
              </td>
              <td className="px-4 py-2.5 text-surface-400 dark:text-surface-500 text-xs">
                {new Date(alert.created_at).toLocaleDateString()}
              </td>
              <td className="px-4 py-2.5 text-right">
                <button
                  onClick={() => resolveAlert.mutate({ alertId: alert.id, inventoryId: alert.inventory_id, merchantId: alert.merchant_id })}
                  className="text-xs font-medium text-cyan-700 hover:text-cyan-900 bg-cyan-50 hover:bg-cyan-100 px-3 py-1 rounded-md transition-colors"
                >
                  Mark Reordered
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddItemModal({ onClose }: { onClose: () => void }) {
  const [itemName, setItemName] = useState('');
  const [unit, setUnit] = useState('g');
  const [stock, setStock] = useState('0');
  const [threshold, setThreshold] = useState('0');
  const addInventory = useAddInventory();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addInventory.mutate(
      {
        itemName,
        unit,
        currentStock: parseFloat(stock),
        minimumThreshold: parseFloat(threshold),
      },
      { onSuccess: onClose }
    );
  };

  return (
    <div className="fixed inset-0 bg-navy-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-navy-900 rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-surface-100 dark:border-surface-600/50">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-white">
            Add Inventory Item
          </h2>
          <button onClick={onClose} className="text-surface-400 dark:text-surface-500 hover:text-surface-600 dark:hover:text-surface-300">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">
              Item Name *
            </label>
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 dark:bg-surface-600 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">
                Unit
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 dark:bg-surface-600 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              >
                <option value="g">grams</option>
                <option value="kg">kg</option>
                <option value="L">liters</option>
                <option value="mL">mL</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">
                Current Stock
              </label>
              <input
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 dark:bg-surface-600 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">
              Minimum Threshold
            </label>
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 dark:bg-surface-600 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
            />
          </div>
          <button
            type="submit"
            disabled={addInventory.isPending}
            className="w-full bg-navy-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-navy-700 transition-colors disabled:opacity-50"
          >
            {addInventory.isPending ? 'Adding...' : 'Add Item'}
          </button>
        </form>
      </div>
    </div>
  );
}

function EditItemModal({ item, onClose }: { item: Inventory; onClose: () => void }) {
  const [itemName, setItemName] = useState(item.item_name);
  const [unit, setUnit] = useState(item.unit);
  const [stock, setStock] = useState(String(item.current_stock));
  const [threshold, setThreshold] = useState(String(item.minimum_threshold));
  const updateInventory = useUpdateInventory();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateInventory.mutate(
      {
        id: item.id,
        itemName,
        unit,
        currentStock: parseFloat(stock),
        minimumThreshold: parseFloat(threshold),
      },
      { onSuccess: onClose }
    );
  };

  return (
    <div className="fixed inset-0 bg-navy-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-navy-900 rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-surface-100 dark:border-surface-600/50">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-white">
            Edit Inventory Item
          </h2>
          <button onClick={onClose} className="text-surface-400 dark:text-surface-500 hover:text-surface-600 dark:hover:text-surface-300">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">
              Item Name *
            </label>
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 dark:bg-surface-600 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">
                Unit
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 dark:bg-surface-600 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              >
                <option value="g">grams</option>
                <option value="kg">kg</option>
                <option value="L">liters</option>
                <option value="mL">mL</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">
                Current Stock
              </label>
              <input
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 dark:bg-surface-600 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">
              Minimum Threshold
            </label>
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 dark:bg-surface-600 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
            />
          </div>
          <button
            type="submit"
            disabled={updateInventory.isPending}
            className="w-full bg-navy-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-navy-700 transition-colors disabled:opacity-50"
          >
            {updateInventory.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white dark:bg-surface-700 rounded-xl border border-surface-200 dark:border-surface-600 p-12 text-center">
      <Package size={40} className="mx-auto text-surface-300 dark:text-surface-500 mb-3" />
      <h3 className="text-lg font-semibold text-surface-600 dark:text-surface-200 mb-1">
        No inventory items
      </h3>
      <p className="text-sm text-surface-500 dark:text-surface-400">
        Add your first inventory item to start tracking stock levels.
      </p>
    </div>
  );
}
