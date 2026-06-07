import Link from 'next/link';

interface Props {
  categories: string[];
  active?: string;
}

// Server-renderable: each category is a real, crawlable URL (/menu?category=Mains)
// instead of a client-side-only filter, which also helps SEO/AI-search discovery.
export default function CategoryTabs({ categories, active }: Props) {
  const tabCls = (isActive: boolean) =>
    `px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
      isActive
        ? 'bg-brand-500 text-white'
        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
    }`;

  return (
    <div className="flex gap-2 flex-wrap">
      <Link href="/menu" className={tabCls(!active)}>All</Link>
      {categories.map((cat) => (
        <Link key={cat} href={`/menu?category=${encodeURIComponent(cat)}`} className={tabCls(active === cat)}>
          {cat}
        </Link>
      ))}
    </div>
  );
}
