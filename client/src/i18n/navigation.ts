import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Use these instead of next/link and next/navigation's useRouter/usePathname/
 * redirect: they keep the /en or /th prefix. `href="/menu"` becomes /th/menu
 * for a Thai visitor, and usePathname() returns "/menu" without the prefix.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
