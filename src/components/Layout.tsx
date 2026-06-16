import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { LowStockAlert } from './LowStockAlert';

export default function Layout() {
  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900">
      <Sidebar />
      <LowStockAlert />
      <main className="lg:ml-64 min-h-screen transition-all duration-300">
        <div className="p-4 pt-16 lg:pt-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
