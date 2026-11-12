// Shared display bits for purchase orders.
import type { Tone } from '../../../components/ui';
import type { RestaurantProfile } from '../../../api/apiSlice';
import { formatAmount } from '../stock/stockApi';
import { bangkokDateISO } from '../../../lib/format';
import { orderDayLabel } from '../suppliers/orderDays';
import type { OrderSheet } from './orderPdf';
import type { PoStatus, PurchaseOrder } from './purchasingApi';

export const STATUS_TONE: Record<PoStatus, Tone> = {
  DRAFT: 'accent', SENT: 'info', PARTLY_RECEIVED: 'warning', RECEIVED: 'success', CANCELLED: 'neutral',
};

type T = (key: string, values?: Record<string, string | number>) => string;

/** "2 × Bag 5 kg" style pack text for one line. */
export function packText(packName: string | null, packSize: string | number, unitLabel: string, locale: string): string {
  return packName || `${formatAmount(packSize, locale)} ${unitLabel}`;
}

/** Everything the PDF needs, in the page's language. */
export function buildOrderSheet(po: PurchaseOrder, restaurant: RestaurantProfile | undefined, t: T, unitLabel: (u: string) => string, locale: string): OrderSheet {
  const a = restaurant?.address;
  const address = a ? [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].filter(Boolean).join(', ') : '';
  const s = po.supplier;
  // Bangkok day of a moment, with the year.
  const day = (iso: string) => orderDayLabel(bangkokDateISO(new Date(iso)), locale, true);
  // Browsers may drop a download name with Thai letters, so keep the plain part of the supplier name.
  const plainName = s.name.replace(/[^\x20-\x7E]/g, '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  return {
    fileName: plainName ? `${po.label} ${plainName}.pdf` : `${po.label}.pdf`,
    draft: po.status === 'DRAFT',
    labels: {
      title: t('pdf.title'), draft: t('pdf.draft'), number: t('pdf.number'), date: t('pdf.date'), delivery: t('pdf.delivery'),
      to: t('pdf.to'), from: t('pdf.from'), no: t('pdf.no'), item: t('pdf.item'), packs: t('pdf.packs'), pack: t('pdf.pack'),
      amount: t('pdf.amount'), note: t('pdf.note'), orderedBy: t('pdf.orderedBy'), page: t('pdf.page'),
    },
    restaurant: {
      name: restaurant?.legalName || restaurant?.name || '',
      lines: [address, restaurant?.telephone ? `${t('pdf.phone')} ${restaurant.telephone}` : ''].filter(Boolean),
    },
    supplier: {
      name: s.name,
      lines: [
        [s.contactName, s.phone && `${t('pdf.phone')} ${s.phone}`, s.lineId && `LINE ${s.lineId}`, s.email].filter(Boolean).join(' · '),
        s.address ?? '',
      ].filter(Boolean),
    },
    number: po.label,
    date: day(po.sentAt ?? new Date().toISOString()),
    delivery: po.expectedDate ? orderDayLabel(po.expectedDate, locale, true) : null,
    lines: po.items.filter((i) => i.packs > 0).map((i) => ({
      name: i.ingredientName,
      packs: i.packs,
      packLabel: packText(i.packName, i.packSize, unitLabel(i.unit), locale),
      amount: `${formatAmount(i.packs * Number(i.packSize), locale)} ${unitLabel(i.unit)}`,
    })),
    note: po.note,
    orderedBy: po.sentBy?.name ?? po.createdBy?.name ?? null,
  };
}
