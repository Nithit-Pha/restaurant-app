import { Link, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { logout } from '../features/auth/authSlice';
import { toggleCart, selectCartCount } from '../features/cart/cartSlice';
import { useGetMeQuery } from '../api/apiSlice';
const ROLE_RANK: Record<string, number> = { CUSTOMER: 0, STAFF: 1, SUPER_ADMIN: 2 };
const hasMin = (role: string | undefined, min: string) => (ROLE_RANK[role ?? ''] ?? -1) >= (ROLE_RANK[min] ?? 999);

export default function Navbar() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const token = useAppSelector((s) => s.auth.accessToken);
  const cartCount = useAppSelector(selectCartCount);
  const { data: user } = useGetMeQuery(undefined, { skip: !token });
  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const role = user?.role;

  return (
    <nav className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 sticky top-0 z-30 transition-colors duration-200">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold text-brand-600">🍽️ RestaurantApp</Link>
        <div className="flex items-center gap-4">
          <Link to="/menu" className="text-sm text-gray-700 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400">Menu</Link>
          {token ? (
            <>
              <Link to="/orders" className="text-sm text-gray-700 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400">Orders</Link>
              {hasMin(role, 'STAFF') && (
                <>
                  <Link to="/admin/menu" className="text-sm text-gray-700 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400">Menu Mgmt</Link>
                  <Link to="/admin/orders" className="text-sm text-gray-700 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400">Orders Mgmt</Link>
                </>
              )}
              {hasMin(role, 'SUPER_ADMIN') && (
                <>
                  <Link to="/admin/finance" className="text-sm text-brand-600 dark:text-brand-400 font-medium hover:text-brand-700 dark:hover:text-brand-300">Finance</Link>
                  <Link to="/admin/audit-log" className="text-sm text-brand-600 dark:text-brand-400 font-medium hover:text-brand-700 dark:hover:text-brand-300">Audit Log</Link>
                  <Link to="/admin/settings" className="text-sm text-brand-600 dark:text-brand-400 font-medium hover:text-brand-700 dark:hover:text-brand-300">Settings</Link>
                </>
              )}
              <button onClick={handleLogout} className="text-sm text-gray-500 dark:text-gray-400 hover:text-red-500">Logout</button>
            </>
          ) : (
            <Link to="/login" className="text-sm text-gray-700 dark:text-gray-300 hover:text-brand-600">Sign in</Link>
          )}

          <button
            onClick={() => dispatch(toggleCart())}
            className="relative bg-brand-500 text-white rounded-full w-9 h-9 flex items-center justify-center hover:bg-brand-600"
          >
            🛒
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </nav>
  );
}
