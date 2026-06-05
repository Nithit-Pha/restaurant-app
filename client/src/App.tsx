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
import ProtectedRoute from './routes/ProtectedRoute';
import RoleRoute from './routes/RoleRoute';

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
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
        </Route>

        <Route path="*" element={<Navigate to="/menu" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
