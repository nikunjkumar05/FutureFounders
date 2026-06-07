import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Package,
  Clock,
  Kanban,
  Headphones,
  Menu,
  X,
  Droplets,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/jobs', icon: Kanban, label: 'Jobs' },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/inventory', icon: Package, label: 'Inventory' },
  { to: '/attendance', icon: Clock, label: 'Attendance' },
  { to: '/tickets', icon: Headphones, label: 'Support' },
];

export default function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 bg-blue-600 text-white p-2 rounded-lg shadow-lg"
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-slate-900 text-white z-40 transform transition-transform duration-200 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="bg-blue-500 p-2 rounded-lg">
              <Droplets size={24} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">AquaTrak</h1>
              <p className="text-xs text-slate-400">Cleaning Service Ops</p>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-700">
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-slate-300">AquaClean Services</p>
            <p className="text-xs text-slate-500">Sunil Sharma</p>
          </div>
        </div>
      </aside>
    </>
  );
}
