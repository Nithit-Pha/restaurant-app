'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import {
  Armchair, Boxes, ChefHat, ClipboardList, History, House, LayoutGrid, LogIn, LogOut, Menu as MenuIcon, NotebookPen, Receipt, Settings, ShoppingBag, Truck, FileText,
  UserPlus, UtensilsCrossed, Wallet, type LucideIcon,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { logout } from '../features/auth/authSlice';
import { selectCartCount, toggleCart } from '../features/cart/cartSlice';
import { useGetAdminOrdersQuery, useGetMeQuery, type User } from '../api/apiSlice';
import { useGetIngredientsQuery } from '../features/admin/stock/stockApi';
import TopBarControls from './TopBarControls';
import { LiveUpdatesProvider } from './LiveUpdates';
import { Drawer } from './ui/Dialog';
import IconButton from './ui/IconButton';
import { cn, ICON_SM, ICON_STROKE } from './ui/cn';

type Role = User['role'];
const ROLE_RANK: Record<Role, number> = { CUSTOMER: 0, STAFF: 1, SUPER_ADMIN: 2 };
const hasMin = (role: Role | undefined, min: Role) => (role ? ROLE_RANK[role] >= ROLE_RANK[min] : false);

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Highlight for sub-paths too (e.g. /orders/123). */
  prefix?: boolean;
  badge?: number;
  /** Red for problems (low stock); amber (default) for new things. */
  badgeTone?: 'warning' | 'danger';
  /** Read after the number by screen readers (default "new"). */
  badgeSr?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

function isActive(pathname: string, item: NavItem) {
  if (!item.prefix) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/* ------------------------------------------------------------------ parts -- */

function BrandMark({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-accent text-sm font-semibold text-accent-fg"
    >
      {name.trim().charAt(0).toUpperCase() || 'R'}
    </span>
  );
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const t = useTranslations('nav');
  const active = isActive(pathname, item);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex h-9 items-center gap-3 rounded-control px-3 text-sm transition-colors duration-150 ease-out',
        active ? 'bg-accent-soft font-medium text-fg' : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
      )}
    >
      <Icon
        size={ICON_SM}
        strokeWidth={ICON_STROKE}
        aria-hidden
        className={cn('shrink-0', active ? 'text-accent' : 'text-fg-subtle group-hover:text-fg-muted')}
      />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge != null && item.badge > 0 && (
        <span
          className={cn(
            'min-w-[1.25rem] rounded-full px-1.5 text-center text-xs font-medium leading-5 tabular-nums',
            item.badgeTone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning',
          )}
        >
          {item.badge}
          <span className="sr-only"> {item.badgeSr ?? t('newSuffix')}</span>
        </span>
      )}
    </Link>
  );
}

interface SidebarContentProps {
  restaurantName: string;
  pathname: string;
  groups: NavGroup[];
  user: User | undefined;
  signedIn: boolean;
  cartCount: number;
  onCart: () => void;
  onSignOut: () => void;
}

function SidebarContent({ restaurantName, pathname, groups, user, signedIn, cartCount, onCart, onSignOut }: SidebarContentProps) {
  const t = useTranslations('nav');
  return (
    <div className="flex h-full flex-col">
      <Link href="/" className="flex h-16 shrink-0 items-center gap-3 px-5">
        <BrandMark name={restaurantName} />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold leading-5 text-fg">{restaurantName}</span>
          <span className="block text-xs text-fg-muted">{t('tagline')}</span>
        </span>
      </Link>

      <nav aria-label={t('main')} className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
        {groups.map((g) => (
          <div key={g.label} className="mb-5 last:mb-0">
            <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wider text-fg-muted">{g.label}</p>
            <ul className="space-y-0.5">
              {g.items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} pathname={pathname} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-line p-3">
        <button
          type="button"
          onClick={onCart}
          aria-label={t('openCart')}
          className="flex h-10 w-full items-center gap-3 rounded-control px-3 text-sm text-fg transition-colors duration-150 hover:bg-surface-hover"
        >
          <ShoppingBag size={ICON_SM} strokeWidth={ICON_STROKE} aria-hidden className="text-fg-muted" />
          <span className="flex-1 text-left font-medium">{t('cart')}</span>
          {cartCount > 0 && (
            <span className="min-w-[1.375rem] rounded-full bg-accent px-1.5 text-center text-xs font-semibold leading-[1.375rem] tabular-nums text-accent-fg">
              {cartCount}
            </span>
          )}
        </button>

        {signedIn ? (
          <div className="mt-2 flex items-center gap-3 rounded-control border border-line bg-canvas/60 px-3 py-2">
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-fg-muted"
            >
              {(user?.name ?? '?').trim().charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-fg">{user?.name ?? '…'}</span>
              <span className="block text-xs text-fg-muted">{user ? t(`role.${user.role}`) : ' '}</span>
            </span>
            <IconButton icon={LogOut} label={t('signOut')} size="sm" onClick={onSignOut} />
          </div>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Link
              href="/login"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-control bg-accent text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
            >
              <LogIn size={ICON_SM} strokeWidth={ICON_STROKE} aria-hidden />
              {t('signIn')}
            </Link>
            <Link
              href="/register"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-control border border-line-strong/60 bg-surface text-sm font-medium text-fg transition-colors hover:bg-surface-hover"
            >
              <UserPlus size={ICON_SM} strokeWidth={ICON_STROKE} aria-hidden />
              {t('register')}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ shell -- */

export default function AppShell({ restaurantName, children }: { restaurantName: string; children: ReactNode }) {
  const t = useTranslations('nav');
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const token = useAppSelector((s) => s.auth.accessToken);
  const cartCount = useAppSelector(selectCartCount);
  const { data: user } = useGetMeQuery(undefined, { skip: !token });
  const role = token ? user?.role : undefined;
  const isStaff = hasMin(role, 'STAFF');

  // New (unaccepted) orders, for the badge next to "Orders". Shares the cache
  // with the staff orders screen, which refreshes it on every status change.
  const { data: pending } = useGetAdminOrdersQuery({ status: 'PENDING' }, { skip: !isStaff, pollingInterval: 30000 });
  // Low-stock ingredients, for the counter next to "Stock" (refreshed by the live "stock" event).
  const { data: ingredients } = useGetIngredientsQuery(undefined, { skip: !isStaff, pollingInterval: 120000 });
  const lowStock = ingredients?.filter((i) => i.low).length;

  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => setMobileOpen(false), [pathname]);

  const groups: NavGroup[] = [
    {
      label: t('groupOrder'),
      items: [
        { href: '/', label: t('home'), icon: House },
        { href: '/menu', label: t('menu'), icon: UtensilsCrossed, prefix: true },
        ...(token ? [{ href: '/orders', label: t('myOrders'), icon: Receipt, prefix: true }] : []),
      ],
    },
  ];
  if (isStaff) {
    groups.push({
      label: t('groupService'),
      items: [
        { href: '/admin/orders', label: t('orders'), icon: ClipboardList, prefix: true, badge: pending?.length },
        { href: '/admin/floor', label: t('floor'), icon: Armchair, prefix: true },
        { href: '/kitchen', label: t('kitchen'), icon: ChefHat, prefix: true },
        { href: '/admin/menu', label: t('menuManagement'), icon: NotebookPen, prefix: true },
        { href: '/admin/stock', label: t('stock'), icon: Boxes, prefix: true, badge: lowStock, badgeTone: 'danger', badgeSr: t('lowSuffix') },
      ],
    });
  }
  if (hasMin(role, 'SUPER_ADMIN')) {
    groups.push({
      label: t('groupBusiness'),
      items: [
        { href: '/admin/tables', label: t('floorPlan'), icon: LayoutGrid, prefix: true },
        { href: '/admin/suppliers', label: t('suppliers'), icon: Truck, prefix: true },
        { href: '/admin/purchase-orders', label: t('purchaseOrders'), icon: FileText, prefix: true },
        { href: '/admin/finance', label: t('finance'), icon: Wallet, prefix: true },
        { href: '/admin/audit-log', label: t('auditLog'), icon: History, prefix: true },
        { href: '/admin/settings', label: t('settings'), icon: Settings, prefix: true },
      ],
    });
  }

  const openCart = () => {
    setMobileOpen(false);
    dispatch(toggleCart());
  };
  const signOut = () => {
    setMobileOpen(false);
    dispatch(logout());
    router.push('/login');
  };

  // Dine-in guests at a table (/t/...) only see the restaurant name and the
  // language / theme switch: no navigation and no pickup/delivery cart.
  if (pathname.startsWith('/t/')) {
    return (
      <>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2.5 border-b border-line bg-surface/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
          <BrandMark name={restaurantName} />
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-fg">{restaurantName}</span>
          <TopBarControls />
        </header>
        <main id="main" className="min-h-screen">{children}</main>
      </>
    );
  }

  const content = (
    <SidebarContent
      restaurantName={restaurantName}
      pathname={pathname}
      groups={groups}
      user={user}
      signedIn={Boolean(token)}
      cartCount={cartCount}
      onCart={openCart}
      onSignOut={signOut}
    />
  );

  return (
    <LiveUpdatesProvider enabled={isStaff}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-raised"
      >
        {t('skipToContent')}
      </a>

      {/* Desktop: fixed sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-surface lg:block print:!hidden">{content}</aside>

      {/* Phones and small tablets: slim top bar + drawer */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-surface/85 lg:hidden print:hidden">
        <IconButton icon={MenuIcon} label={t('openNavigation')} onClick={() => setMobileOpen(true)} />
        <Link href="/" className="flex min-w-0 flex-1 items-center gap-2.5">
          <BrandMark name={restaurantName} />
          <span className="truncate text-[15px] font-semibold text-fg">{restaurantName}</span>
        </Link>
        <TopBarControls />
        <IconButton icon={ShoppingBag} label={t('openCart')} count={cartCount} onClick={openCart} />
      </header>
      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} title={t('navigation')} side="left" width="max-w-[17rem]" bare>
        {content}
      </Drawer>

      <main id="main" className="min-h-screen lg:pl-64 print:!pl-0">
        {/* Desktop: slim bar across the page area, corner controls on the right.
            Page-level sticky elements sit below it (lg:top-12). */}
        <div className="sticky top-0 z-30 hidden h-12 items-center justify-end border-b border-line bg-surface/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-surface/85 lg:flex lg:px-6 print:!hidden">
          <TopBarControls />
        </div>
        {children}
      </main>
    </LiveUpdatesProvider>
  );
}
