import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Package,
  Clock,
  Kanban,
  Headphones,
  Menu,
  X,
  LogOut,
  Sun,
  Moon,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/jobs', icon: Kanban, label: 'Jobs' },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/inventory', icon: Package, label: 'Inventory' },
  { to: '/attendance', icon: Clock, label: 'Employees' },
  { to: '/tickets', icon: Headphones, label: 'Messages' },
];

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 btn-ghost p-2"
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Close menu' : 'Open menu'}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-navy-900/20 backdrop-blur-sm z-30"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full z-40 flex flex-col
          bg-white dark:bg-navy-900 border-r border-surface-100 dark:border-surface-700
          transition-all duration-300 ease-in-out
          ${collapsed ? 'w-[72px]' : 'w-64'}
          ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        {/* Header */}
        <div className={`p-4 border-b border-surface-100 dark:border-surface-700 ${collapsed ? 'px-4' : 'px-5'}`}>
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <img src="/logo.png" alt="Logo" className="w-10 h-10 rounded-xl object-contain" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="font-display font-bold text-navy-900 dark:text-surface-100 text-sm truncate">
                  Operation Waterflow
                </h1>
                <p className="text-xs text-surface-500 dark:text-surface-400 truncate">
                  Tank cleaning ops
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className={`flex-1 py-3 ${collapsed ? 'px-2' : 'px-3'} space-y-0.5 overflow-y-auto scrollbar-thin`}>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-150
                ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}
                ${
                  isActive
                    ? 'bg-cyan-50 dark:bg-cyan-950/50 text-navy-700 dark:text-cyan-300 font-semibold'
                    : 'text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-700 hover:text-navy-900 dark:hover:text-surface-100'
                }`
              }
              title={collapsed ? label : undefined}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className={`border-t border-surface-100 dark:border-surface-700 ${collapsed ? 'p-2' : 'p-3'} space-y-1`}>
          {/* Collapse toggle (desktop only) */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`hidden lg:flex items-center gap-3 w-full rounded-xl text-sm font-medium text-surface-500 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-700 hover:text-navy-700 dark:hover:text-surface-200 transition-colors ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}`}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Menu size={18} />
            {!collapsed && <span>Collapse</span>}
          </button>

          <button
            onClick={toggle}
            className={`flex items-center gap-3 w-full rounded-xl text-sm font-medium text-surface-500 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-700 hover:text-navy-700 dark:hover:text-surface-200 transition-colors ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}`}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            {!collapsed && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
          </button>

          <button
            onClick={handleLogout}
            className={`flex items-center gap-3 w-full rounded-xl text-sm font-medium text-surface-500 dark:text-surface-400 hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-600 dark:hover:text-red-400 transition-colors ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}`}
            title="End shift and sign out"
          >
            <LogOut size={18} />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
