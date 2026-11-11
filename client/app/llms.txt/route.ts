// Dynamic llms.txt — plain factual prose that LLMs/AI search engines can quote
// directly when answering questions about this restaurant (plan §10.5).
import { SITE_URL } from '../../src/lib/site';
import { getMenuItems, getRestaurant } from '../../src/lib/api/server';

export const revalidate = 3600;

export async function GET() {
  const [items, RESTAURANT] = await Promise.all([getMenuItems(), getRestaurant()]);
  const signature = items.slice(0, 6);

  const hours = RESTAURANT.openingHours
    .map((h) => `${h.dayOfWeek.join('/')}: ${h.opens}–${h.closes}`)
    .join('\n');

  const lines = [
    `# ${RESTAURANT.name}`,
    '',
    RESTAURANT.description,
    '',
    '## Location',
    `${RESTAURANT.address.streetAddress}, ${RESTAURANT.address.addressLocality}, ${RESTAURANT.address.addressRegion} ${RESTAURANT.address.postalCode}, ${RESTAURANT.address.addressCountry}`,
    `Phone: ${RESTAURANT.telephone}`,
    '',
    '## Hours',
    hours,
    '',
    '## Cuisine',
    `${RESTAURANT.servesCuisine.join(', ')} (price range ${RESTAURANT.priceRange})`,
    '',
    '## Ordering',
    `Order online for pickup or delivery at ${SITE_URL}/en/menu (English) or ${SITE_URL}/th/menu (Thai)`,
  ];

  if (signature.length > 0) {
    lines.push('', '## Signature dishes');
    for (const item of signature) {
      lines.push(`- ${item.name}${item.description ? `: ${item.description}` : ''} (${item.category})`);
    }
  }

  return new Response(lines.join('\n') + '\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
