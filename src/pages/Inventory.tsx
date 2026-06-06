import { useState } from 'react';
import { Plus, Package, X, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { useInventory, useAddInventory, useUpdateInventory, useDeleteInventory, useStockAlerts, useResolveAlert } from '../lib/queries';
import { CardSkeleton } from '../components/LoadingSkeleton';
import type { Inventory } from '../lib/types';

export default function Inventory() {
  const { data: inventory, isLoading } = useInventory();
  const { data: alerts } = useStockAlerts();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editItem, setEditItem] = useState<Inventory | null>(null);
  const [showAlertHistory, setShowAlertHistory] = useState(false);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-slate-500 text-sm mt-1">
            Track chemical supplies and stock levels
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={16} />
          Add Item
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
                ? 'critical'
                : item.current_stock < item.minimum_threshold * 2
                ? 'low'
                : 'ok';
            const barColor =
              status === 'critical'
                ? 'bg-red-500'
                : status === 'low'
                ? 'bg-amber-500'
                : 'bg-green-500';
            const badgeColor =
              status === 'critical'
                ? 'bg-red-100 text-red-700'
                : status === 'low'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-green-100 text-green-700';
            const badgeLabel =
              status === 'critical'
                ? 'Critical'
                : status === 'low'
                ? 'Low'
                : 'OK';

            return (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-100">
                      <Package size={18} className="text-slate-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        {item.item_name}
                      </h3>
                      <p className="text-xs text-slate-400">
                        Per {item.unit}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditItem(item)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Edit item"
                    >
                      <Pencil size={14} />
                    </button>
                    <DeleteButton itemId={item.id} itemName={item.item_name} />
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${badgeColor}`}
                    >
                      {badgeLabel}
                    </span>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                    <span>
                      Current: {item.current_stock}
                      {item.unit}
                    </span>
                    <span>
                      Min: {item.minimum_threshold}
                      {item.unit}
                    </span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor}`}
                      style={{
                        width: `${Math.min(ratio * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="text-xs text-slate-400">
                  Max ref: {(item.minimum_threshold * 3).toFixed(0)}
                  {item.unit}
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
            className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 mb-3"
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
          className="text-[10px] text-slate-400 hover:text-slate-600"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
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
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">
              Item
            </th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">
              Current Stock
            </th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">
              Min Threshold
            </th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">
              Created
            </th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {alerts?.map((alert) => (
            <tr key={alert.id} className="hover:bg-slate-50">
              <td className="px-4 py-2.5 font-medium text-slate-900">
                {alert.inventory?.item_name}
              </td>
              <td className="px-4 py-2.5 text-red-600 font-medium">
                {alert.inventory?.current_stock}
                {alert.inventory?.unit}
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                {alert.inventory?.minimum_threshold}
                {alert.inventory?.unit}
              </td>
              <td className="px-4 py-2.5 text-slate-400 text-xs">
                {new Date(alert.created_at).toLocaleDateString()}
              </td>
              <td className="px-4 py-2.5 text-right">
                <button
                  onClick={() => resolveAlert.mutate({ alertId: alert.id })}
                  className="text-xs font-medium text-green-700 hover:text-green-900 bg-green-50 hover:bg-green-100 px-3 py-1 rounded-md transition-colors"
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">
            Add Inventory Item
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Item Name *
            </label>
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Unit
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="g">grams</option>
                <option value="kg">kg</option>
                <option value="L">liters</option>
                <option value="mL">mL</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Current Stock
              </label>
              <input
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Minimum Threshold
            </label>
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={addInventory.isPending}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">
            Edit Inventory Item
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Item Name *
            </label>
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Unit
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="g">grams</option>
                <option value="kg">kg</option>
                <option value="L">liters</option>
                <option value="mL">mL</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Current Stock
              </label>
              <input
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Minimum Threshold
            </label>
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={updateInventory.isPending}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
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
    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
      <Package size={40} className="mx-auto text-slate-300 mb-3" />
      <h3 className="text-lg font-semibold text-slate-700 mb-1">
        No inventory items
      </h3>
      <p className="text-sm text-slate-500">
        Add your first inventory item to start tracking stock levels.
      </p>
    </div>
  );
}
