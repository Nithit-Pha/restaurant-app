import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import CartDrawer from './features/cart/CartDrawer';
import LoginPage from './features/auth/LoginPage';
import RegisterPage from './features/auth/RegisterPage';
import MenuPage from './features/menu/MenuPage';
import CheckoutPage from './features/checkout/CheckoutPage';
import MyOrdersPage from './features/orders/MyOrdersPage';
import AdminMenuPage from './features/admin/AdminMenuPage';
import AdminOrdersPage from './features/admin/AdminOrdersPage';
import SettingsPage from './features/admin/SettingsPage';
import FinancialDashboard from './features/admin/finance/FinancialDashboard';
import AuditLogPage from './features/admin/AuditLogPage';
import ProtectedRoute from './routes/ProtectedRoute';
import RoleRoute from './routes/RoleRoute';
import { useTheme } from './context/ThemeContext';

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="fixed top-3 right-4 z-50 w-9 h-9 flex items-center justify-center rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 shadow-sm hover:shadow-md transition-all"
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <ThemeToggle />
      <CartDrawer />
      <Routes>
        <Route path="/" element={<Navigate to="/menu" replace />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Any logged-in user */}
        <Route element={<ProtectedRoute />}>
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/orders" element={<MyOrdersPage />} />
          <Route path="/orders/:id" element={<MyOrdersPage />} />
        </Route>

        {/* Staff and above */}
        <Route element={<RoleRoute minRole="STAFF" />}>
          <Route path="/admin/menu" element={<AdminMenuPage />} />
          <Route path="/admin/orders" element={<AdminOrdersPage />} />
        </Route>

        {/* Super Admin only */}
        <Route element={<RoleRoute minRole="SUPER_ADMIN" />}>
          <Route path="/admin/settings" element={<SettingsPage />} />
          <Route path="/admin/finance" element={<FinancialDashboard />} />
          <Route path="/admin/audit-log" element={<AuditLogPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/menu" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
