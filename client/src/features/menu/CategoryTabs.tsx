import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '../../components/ui/cn';

interface Props {
  categories: string[];
  active?: string;
}

// Server-renderable: each category is a real, crawlable URL (/en/menu?category=Mains)
// instead of a client-side-only filter, which also helps SEO/AI-search discovery.
export default function CategoryTabs({ categories, active }: Props) {
  const t = useTranslations('menu');
  const tabCls = (isActive: boolean) =>
    cn(
      'inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors duration-150',
      isActive
        ? 'border-accent bg-accent text-accent-fg'
        : 'border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg',
    );

  return (
    <nav aria-label={t('categories')} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-2 pb-1 sm:flex-wrap">
        <Link href="/menu" className={tabCls(!active)} aria-current={!active ? 'page' : undefined}>
          {t('all')}
        </Link>
        {categories.map((cat) => (
          <Link
            key={cat}
            href={{ pathname: '/menu', query: { category: cat } }}
            className={tabCls(active === cat)}
            aria-current={active === cat ? 'page' : undefined}
          >
            {cat}
          </Link>
        ))}
      </div>
    </nav>
  );
}
