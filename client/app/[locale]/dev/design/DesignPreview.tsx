'use client';

import { useState } from 'react';
import {
  Bell, BellOff, Bike, Check, ChefHat, ClipboardList, Moon, Plus, Search, ShoppingBag, Store, Sun, Trash2, UtensilsCrossed,
} from 'lucide-react';
import {
  Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader, ChipGroup, Dialog, Drawer, EmptyState, Field, fieldAria,
  IconButton, Input, LoadingBlock, PageContainer, PageHeader, SegmentedControl, Select, Skeleton, Spinner, Stat, Switch,
  Table, TBody, TD, TH, THead, TR, Textarea, useToast,
} from '../../../../src/components/ui';
import OrderStatusBadge from '../../../../src/features/orders/OrderStatusBadge';
import PaymentBadge from '../../../../src/features/orders/PaymentBadge';
import { useTheme } from '../../../../src/context/ThemeContext';
import { formatCurrency } from '../../../../src/lib/format';

const SWATCHES: Array<{ name: string; cls: string; note: string }> = [
  { name: 'canvas', cls: 'bg-canvas', note: 'Page background' },
  { name: 'surface', cls: 'bg-surface', note: 'Cards, sidebar, dialogs' },
  { name: 'surface-muted', cls: 'bg-surface-muted', note: 'Sunken areas, table header' },
  { name: 'surface-hover', cls: 'bg-surface-hover', note: 'Hover' },
  { name: 'line', cls: 'bg-line', note: 'Borders, dividers' },
  { name: 'line-strong', cls: 'bg-line-strong', note: 'Input borders' },
  { name: 'fg', cls: 'bg-fg', note: 'Main text' },
  { name: 'fg-muted', cls: 'bg-fg-muted', note: 'Secondary text' },
  { name: 'accent', cls: 'bg-accent', note: 'Primary actions, active nav' },
  { name: 'accent-soft', cls: 'bg-accent-soft', note: 'Selected backgrounds' },
  { name: 'success', cls: 'bg-success', note: 'Ready, paid' },
  { name: 'warning', cls: 'bg-warning', note: 'New, waiting long' },
  { name: 'danger', cls: 'bg-danger', note: 'Cancelled, destructive' },
  { name: 'info', cls: 'bg-info', note: 'Preparing, on the way' },
];

const SAMPLE_ORDERS = [
  { no: '#014', time: '12:41', items: '2 × Pad Thai, 1 × Thai iced tea', type: 'Pickup', status: 'PENDING' as const, pay: { paymentMethod: 'CASH' as const, paymentStatus: 'UNPAID' as const }, total: 245, wait: 3 },
  { no: '#013', time: '12:32', items: '1 × Green curry, 1 × Jasmine rice', type: 'Delivery', status: 'PREPARING' as const, pay: { paymentMethod: 'PROMPTPAY' as const, paymentStatus: 'PAID' as const }, total: 180, wait: 12 },
  { no: '#012', time: '12:10', items: '3 × Khao man gai', type: 'Pickup', status: 'READY' as const, pay: { paymentMethod: 'PROMPTPAY' as const, paymentStatus: 'PENDING' as const }, total: 270, wait: 34 },
  { no: '#011', time: '11:52', items: '1 × Tom yum goong', type: 'Delivery', status: 'DELIVERED' as const, pay: { paymentMethod: 'CASH' as const, paymentStatus: 'PAID' as const }, total: 150, wait: 0 },
  { no: '#010', time: '11:40', items: '2 × Mango sticky rice', type: 'Pickup', status: 'CANCELLED' as const, pay: { paymentMethod: 'CASH' as const, paymentStatus: 'UNPAID' as const }, total: 160, wait: 0 },
];

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-10 first:border-t-0 first:pt-0">
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function DesignPreview() {
  const { theme, toggle } = useTheme();
  const toast = useToast();
  const [dialog, setDialog] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [mode, setMode] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [chip, setChip] = useState('ALL');
  const [available, setAvailable] = useState(true);
  const [sound, setSound] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState('#013');

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Internal"
        title="Design system"
        description="Tokens and shared components. Switch the theme to check both."
        actions={
          <Button variant="secondary" icon={theme === 'dark' ? Sun : Moon} onClick={toggle}>
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </Button>
        }
      />

      <Section title="Colour" description="Warm ivory and warm gray, one muted olive accent, four status hues.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {SWATCHES.map((s) => (
            <div key={s.name} className="overflow-hidden rounded-card border border-line bg-surface">
              <div className={`h-14 ${s.cls} border-b border-line`} />
              <div className="px-3 py-2">
                <p className="text-xs font-medium text-fg">{s.name}</p>
                <p className="text-xs text-fg-muted">{s.note}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography" description="IBM Plex Sans with IBM Plex Sans Thai. Numbers use tabular figures.">
        <Card>
          <CardBody className="space-y-4">
            <p className="text-3xl font-semibold tracking-tight">Today at the restaurant</p>
            <p className="text-2xl font-semibold tracking-tight">Orders — page title, 24</p>
            <p className="text-xl font-semibold">Section heading, 20</p>
            <p className="text-lg font-medium">Card heading, 18</p>
            <p className="text-base">Customer body text, 16. ข้าวมันไก่ และชาไทยเย็น สั่งกลับบ้านได้ทุกวัน</p>
            <p className="text-sm">Staff body text, 14. ผัดไทยกุ้งสด 2 จาน · ไม่ใส่ถั่ว</p>
            <p className="text-sm text-fg-muted">Secondary text, 14 muted</p>
            <p className="text-xs text-fg-muted">Caption, 12 — ordered 12:41 by Somchai</p>
            <div className="flex flex-wrap gap-8 pt-2 text-lg tabular-nums">
              <span>{formatCurrency(1245)}</span>
              <span>{formatCurrency(89.5)}</span>
              <span>#0141</span>
              <span>12:05</span>
            </div>
          </CardBody>
        </Card>
      </Section>

      <Section title="Buttons" description="One primary action per area. Destructive actions are red and usually confirmed.">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Place order</Button>
            <Button variant="secondary">Save draft</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger" icon={Trash2}>Delete item</Button>
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" icon={Plus}>Add</Button>
            <Button size="md" icon={Check}>Accept</Button>
            <Button size="lg" icon={ChefHat}>Mark ready</Button>
            <IconButton icon={Search} label="Search" variant="secondary" />
            <IconButton icon={ShoppingBag} label="Open cart" variant="secondary" count={3} />
            <IconButton icon={sound ? Bell : BellOff} label={sound ? 'Sound on' : 'Sound off'} onClick={() => setSound((s) => !s)} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              loading={saving}
              onClick={() => {
                setSaving(true);
                setTimeout(() => {
                  setSaving(false);
                  toast({ title: 'Menu item saved', description: 'Pad Thai is now on the menu.' });
                }, 900);
              }}
            >
              Save and show toast
            </Button>
            <Button variant="secondary" onClick={() => toast({ tone: 'error', title: 'Could not update the order', description: 'Check the connection and try again.' })}>
              Error toast
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Forms" description="Labels above inputs, required marker, hint or error below.">
        <Card className="max-w-2xl">
          <CardHeader title="Contact details" description="Used by the restaurant if there is a problem with the order." />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <Field label="Name" htmlFor="d-name" required>
              <Input {...fieldAria('d-name', { required: true })} placeholder="Your name" defaultValue="Somchai" />
            </Field>
            <Field label="Phone number" htmlFor="d-phone" required error="Enter a Thai phone number, e.g. 081 234 5678">
              <Input {...fieldAria('d-phone', { required: true, error: true })} defaultValue="0812" inputMode="tel" />
            </Field>
            <Field label="Category" htmlFor="d-cat" hint="Shown as a tab on the menu.">
              <Select {...fieldAria('d-cat', { hint: true })} defaultValue="mains">
                <option value="mains">Mains</option>
                <option value="drinks">Drinks</option>
              </Select>
            </Field>
            <Field label="Promised time" htmlFor="d-dis">
              <Input id="d-dis" disabled defaultValue="20 min" />
            </Field>
            <Field label="Note for the kitchen" htmlFor="d-note" className="sm:col-span-2">
              <Textarea id="d-note" placeholder="Allergies, spice level…" />
            </Field>
            <div className="flex flex-wrap items-center gap-6 sm:col-span-2">
              <Switch checked={available} onChange={setAvailable} label="Available today" />
              <SegmentedControl
                label="Order type"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'PICKUP', label: 'Pickup', icon: Store },
                  { value: 'DELIVERY', label: 'Delivery', icon: Bike },
                ]}
              />
            </div>
          </CardBody>
          <CardFooter>
            <Button variant="ghost">Cancel</Button>
            <Button>Save</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Statuses" description="Dot + label. Order and payment statuses.">
        <div className="flex flex-wrap gap-2">
          {(['PENDING', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'] as const).map((s) => (
            <OrderStatusBadge key={s} status={s} type="DELIVERY" short />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <PaymentBadge order={{ paymentMethod: 'CASH', paymentStatus: 'UNPAID' }} />
          <PaymentBadge order={{ paymentMethod: 'PROMPTPAY', paymentStatus: 'PENDING' }} />
          <PaymentBadge order={{ paymentMethod: 'PROMPTPAY', paymentStatus: 'PAID' }} />
          <PaymentBadge order={{ paymentMethod: 'CASH', paymentStatus: 'REFUNDED' }} />
          <Badge tone="accent">Popular</Badge>
          <Badge>Sold out</Badge>
        </div>
        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          <Alert tone="warning" title="Ordering is closed right now">We open again at 10:00. You can still look at the menu.</Alert>
          <Alert tone="danger" title="Could not place the order">The restaurant stopped taking orders a moment ago.</Alert>
          <Alert tone="success" title="Payment received">Order #012 is marked as paid.</Alert>
          <Alert tone="info">Busy right now — orders take about 15 minutes longer.</Alert>
        </div>
      </Section>

      <Section title="Summary figures" description="Only figures someone acts on. No decorative charts.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Revenue today" value={formatCurrency(12450)} note="38 paid orders" />
          <Stat label="Expenses today" value={formatCurrency(3120)} note="Ingredients, gas" />
          <Stat label="Profit today" value={formatCurrency(9330)} note="Revenue − expenses" />
        </div>
      </Section>

      <Section title="Table" description="Staff order list: chips filter, tabular numbers, hover and selected rows, waiting time.">
        <ChipGroup
          label="Filter by status"
          value={chip}
          onChange={setChip}
          className="mb-4"
          options={[
            { value: 'ALL', label: 'All', count: 5 },
            { value: 'PENDING', label: 'New', count: 1, emphasis: true },
            { value: 'PREPARING', label: 'Preparing', count: 1 },
            { value: 'READY', label: 'Ready', count: 1 },
            { value: 'DONE', label: 'Done', count: 2 },
          ]}
        />
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <tr>
                <TH>Order</TH>
                <TH>Items</TH>
                <TH>Type</TH>
                <TH>Status</TH>
                <TH>Payment</TH>
                <TH numeric>Total</TH>
                <TH numeric>Waiting</TH>
              </tr>
            </THead>
            <TBody>
              {SAMPLE_ORDERS.map((o) => (
                <TR key={o.no} interactive selected={selected === o.no} onClick={() => setSelected(o.no)}>
                  <TD className="font-semibold tabular-nums">
                    {o.no}
                    <span className="ml-2 font-normal text-fg-muted">{o.time}</span>
                  </TD>
                  <TD className="max-w-xs truncate">{o.items}</TD>
                  <TD muted>{o.type}</TD>
                  <TD><OrderStatusBadge status={o.status} type="DELIVERY" short /></TD>
                  <TD><PaymentBadge order={o.pay} /></TD>
                  <TD numeric>{formatCurrency(o.total)}</TD>
                  <TD numeric className={o.wait >= 25 ? 'font-medium text-danger' : o.wait >= 15 ? 'font-medium text-warning' : 'text-fg-muted'}>
                    {o.wait ? `${o.wait} min` : '—'}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </Section>

      <Section title="Dialogs, drawer, toasts">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setDialog(true)}>Open dialog</Button>
          <Button variant="secondary" onClick={() => setConfirm(true)}>Open confirmation</Button>
          <Button variant="secondary" icon={ShoppingBag} onClick={() => setDrawer(true)}>Open cart drawer</Button>
        </div>
        <Dialog
          open={dialog}
          onClose={() => setDialog(false)}
          title="Accept order #014"
          description="How long until it is ready? The customer sees this time."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialog(false)}>Back</Button>
              <Button data-autofocus onClick={() => { setDialog(false); toast({ title: 'Order #014 accepted', description: 'Ready in 20 min.' }); }}>
                Accept · ready in 20 min
              </Button>
            </>
          }
        >
          <SegmentedControl
            label="Preparation time"
            value="20"
            onChange={() => {}}
            options={[{ value: '10', label: '10 min' }, { value: '15', label: '15 min' }, { value: '20', label: '20 min' }, { value: '30', label: '30 min' }]}
            className="w-full"
          />
        </Dialog>
        <Dialog
          open={confirm}
          onClose={() => setConfirm(false)}
          size="sm"
          title="Cancel order #014?"
          description="The customer will see that the order was cancelled. This cannot be undone."
          footer={
            <>
              <Button variant="ghost" data-autofocus onClick={() => setConfirm(false)}>Keep order</Button>
              <Button variant="danger" onClick={() => setConfirm(false)}>Cancel order</Button>
            </>
          }
        />
        <Drawer
          open={drawer}
          onClose={() => setDrawer(false)}
          title="Your cart"
          footer={<Button fullWidth size="lg" onClick={() => setDrawer(false)}>Checkout</Button>}
        >
          <EmptyState icon={ShoppingBag} title="Your cart is empty" description="Add something from the menu to start an order." />
        </Drawer>
      </Section>

      <Section title="Empty and loading states">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <EmptyState icon={ClipboardList} title="No orders yet today" description="New orders appear here automatically." />
          </Card>
          <Card>
            <LoadingBlock label="Loading orders…" />
          </Card>
          <Card className="space-y-3 p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            <Skeleton className="h-24 w-full" />
            <div className="flex items-center gap-2 text-sm text-fg-muted"><Spinner size={16} /> Inline spinner</div>
          </Card>
        </div>
      </Section>

      <Section title="Menu item card (preview of slice 4)">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { name: 'Pad Thai', desc: 'Rice noodles, tamarind, peanuts, lime.', price: 120 },
            { name: 'Green curry', desc: 'Chicken, Thai basil, coconut milk.', price: 140 },
          ].map((m) => (
            <Card key={m.name} className="flex flex-col overflow-hidden transition-shadow duration-150 hover:shadow-soft">
              <div className="flex aspect-[4/3] items-center justify-center bg-surface-muted text-fg-subtle">
                <UtensilsCrossed size={28} strokeWidth={1.5} aria-hidden />
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h3 className="font-medium text-fg">{m.name}</h3>
                <p className="mt-1 flex-1 text-sm text-fg-muted">{m.desc}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="font-semibold tabular-nums">{formatCurrency(m.price)}</span>
                  <Button size="sm" variant="secondary" icon={Plus}>Add</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Section>
    </PageContainer>
  );
}
