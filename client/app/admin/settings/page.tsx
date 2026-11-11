'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, Plus, Trash2, UserPlus } from 'lucide-react';
import {
  useGetSettingsQuery,
  useSetTaxRateMutation,
  useSetDeliveryFeeMutation,
  useSetOrderingMutation,
  useGetRestaurantQuery,
  useSetRestaurantMutation,
  useGetStaffQuery,
  useCreateStaffMutation,
  useUpdateStaffRoleMutation,
  useSetStaffActiveMutation,
  type RestaurantProfile,
  type StaffUser,
} from '../../../src/api/apiSlice';
import { useRequireRole } from '../../../src/routes/useAuthGuard';
import PaymentSettingsSection from '../../../src/features/admin/settings/PaymentSettingsSection';
import {
  Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader, Dialog, Field, IconButton, Input, LoadingBlock, PageContainer,
  PageHeader, Select, Switch, Table, TBody, TD, TH, THead, TR, Textarea, cn, useToast,
} from '../../../src/components/ui';

const SECTIONS = [
  { id: 'profile', label: 'Restaurant profile' },
  { id: 'ordering', label: 'Online ordering' },
  { id: 'payments', label: 'Payments' },
  { id: 'tax', label: 'Tax' },
  { id: 'delivery', label: 'Delivery fees' },
  { id: 'staff', label: 'Staff accounts' },
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Seven toggle buttons for the days an opening-hours row applies to. */
function DayPicker({ value, onChange }: { value: string[]; onChange: (days: string[]) => void }) {
  return (
    <div role="group" aria-label="Days" className="flex gap-1">
      {DAYS.map((d) => {
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            aria-label={d}
            title={d}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : DAYS.filter((x) => x === d || value.includes(x)))}
            className={cn(
              'h-9 w-10 rounded-control border text-xs font-medium transition-colors duration-150',
              on ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg',
            )}
          >
            {d.slice(0, 2)}
          </button>
        );
      })}
    </div>
  );
}

function PasswordInput({ id, value, onChange, invalid, ...rest }: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        className="pr-10"
        {...rest}
      />
      <span className="absolute right-1 top-1/2 -translate-y-1/2">
        <IconButton
          icon={show ? EyeOff : Eye}
          label={show ? 'Hide password' : 'Show password'}
          size="sm"
          onClick={() => setShow((v) => !v)}
        />
      </span>
    </div>
  );
}

const EMPTY_STAFF = { name: '', username: '', email: '', password: '', confirmPassword: '', role: 'STAFF' as 'STAFF' | 'SUPER_ADMIN' };

export default function SettingsPage() {
  const { ready } = useRequireRole('SUPER_ADMIN');
  const toast = useToast();
  const { data: settings, isLoading } = useGetSettingsQuery(undefined, { skip: !ready });
  const [setTax, { isLoading: savingTax }] = useSetTaxRateMutation();
  const [setDelivery, { isLoading: savingDelivery }] = useSetDeliveryFeeMutation();
  const { data: restaurant } = useGetRestaurantQuery(undefined, { skip: !ready });
  const [setRestaurant, { isLoading: savingProfile }] = useSetRestaurantMutation();
  const { data: staff = [] } = useGetStaffQuery(undefined, { skip: !ready });
  const [createStaff, { isLoading: creatingStaff }] = useCreateStaffMutation();
  const [updateRole] = useUpdateStaffRoleMutation();
  const [setStaffActive, { isLoading: changingActive }] = useSetStaffActiveMutation();
  const [setOrdering] = useSetOrderingMutation();

  const [taxPct, setTaxPct] = useState('');
  const [baseFee, setBaseFee] = useState('');
  const [feePerKm, setFeePerKm] = useState('');
  const [freeKm, setFreeKm] = useState('');
  const [maxKm, setMaxKm] = useState('');

  // Restaurant profile form state
  const [profile, setProfile] = useState<RestaurantProfile | null>(null);
  const [cuisineStr, setCuisineStr] = useState('');
  const [sameAsStr, setSameAsStr] = useState('');
  const [profileError, setProfileError] = useState('');

  const [newStaff, setNewStaff] = useState(EMPTY_STAFF);
  const [staffOpen, setStaffOpen] = useState(false);
  const [staffError, setStaffError] = useState('');
  const [deactivating, setDeactivating] = useState<StaffUser | null>(null);

  useEffect(() => {
    if (settings) {
      setTaxPct(String(Math.round(settings.TAX_RATE * 100)));
      setBaseFee(String(settings.DELIVERY_BASE_FEE));
      setFeePerKm(String(settings.DELIVERY_FEE_PER_KM));
      setFreeKm(String(settings.DELIVERY_FREE_KM));
      setMaxKm(String(settings.DELIVERY_MAX_KM));
    }
  }, [settings]);

  useEffect(() => {
    if (restaurant) {
      setProfile(restaurant);
      setCuisineStr(restaurant.servesCuisine.join(', '));
      setSameAsStr(restaurant.sameAs.join('\n'));
    }
  }, [restaurant]);

  const saved = (title: string) => toast({ title });
  const failed = (title: string, err?: unknown) =>
    toast({ tone: 'error', title, description: (err as { data?: { message?: string } })?.data?.message ?? 'Please check the values and try again.' });

  const saveTax = async () => {
    try {
      await setTax({ value: parseFloat(taxPct) / 100 }).unwrap();
      saved('Tax rate saved');
    } catch (err) {
      failed('Could not save the tax rate', err);
    }
  };

  const saveDelivery = async () => {
    try {
      await setDelivery({ baseFee: parseFloat(baseFee), feePerKm: parseFloat(feePerKm), freeKm: parseFloat(freeKm), maxKm: parseFloat(maxKm) }).unwrap();
      saved('Delivery fee saved');
    } catch (err) {
      failed('Could not save the delivery fee', err);
    }
  };

  // --- profile helpers ---
  const setP = (patch: Partial<RestaurantProfile>) => setProfile((p) => (p ? { ...p, ...patch } : p));
  const setAddr = (patch: Partial<RestaurantProfile['address']>) =>
    setProfile((p) => (p ? { ...p, address: { ...p.address, ...patch } } : p));
  const setHour = (i: number, patch: Partial<RestaurantProfile['openingHours'][number]>) =>
    setProfile((p) => {
      if (!p) return p;
      const openingHours = p.openingHours.map((h, idx) => (idx === i ? { ...h, ...patch } : h));
      return { ...p, openingHours };
    });
  const addHour = () =>
    setProfile((p) => (p ? { ...p, openingHours: [...p.openingHours, { dayOfWeek: [], opens: '11:00', closes: '21:00' }] } : p));
  const removeHour = (i: number) =>
    setProfile((p) => (p ? { ...p, openingHours: p.openingHours.filter((_, idx) => idx !== i) } : p));

  const saveProfile = async () => {
    if (!profile) return;
    setProfileError('');
    if (!profile.name.trim()) { setProfileError('Restaurant name is required'); return; }
    const payload: RestaurantProfile = {
      ...profile,
      servesCuisine: cuisineStr.split(',').map((s) => s.trim()).filter(Boolean),
      sameAs: sameAsStr.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
      geo: { latitude: Number(profile.geo.latitude), longitude: Number(profile.geo.longitude) },
      openingHours: profile.openingHours.map((h) => ({
        ...h,
        dayOfWeek: Array.isArray(h.dayOfWeek)
          ? h.dayOfWeek
          : String(h.dayOfWeek).split(',').map((d) => d.trim()).filter(Boolean),
      })),
    };
    try {
      await setRestaurant(payload).unwrap();
      saved('Restaurant profile saved');
    } catch {
      setProfileError('Failed to save profile (check the values and try again)');
    }
  };

  const passwordsDiffer = Boolean(newStaff.confirmPassword) && newStaff.password !== newStaff.confirmPassword;

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffError('');
    if (newStaff.password !== newStaff.confirmPassword) {
      setStaffError('Passwords do not match');
      return;
    }
    try {
      const { confirmPassword: _, email, ...rest } = newStaff;
      await createStaff({ ...rest, email: email.trim() || undefined }).unwrap();
      saved(`Account created for ${newStaff.name}`);
      setNewStaff(EMPTY_STAFF);
      setStaffOpen(false);
    } catch (err) {
      // Show the server's reason (e.g. "Username already taken") when there is one.
      setStaffError((err as { data?: { message?: string } })?.data?.message || 'Failed to create staff account');
    }
  };

  if (!ready) return null;
  if (isLoading) return <PageContainer><LoadingBlock label="Loading settings…" /></PageContainer>;

  const hoursEnforced = (settings?.ORDERING_HOURS_ENFORCED ?? 1) !== 0;

  return (
    <PageContainer wide>
      <PageHeader eyebrow="Business" title="Settings" description="Your restaurant's details, how customers order and pay, and who can sign in." />

      <div className="grid items-start gap-8 lg:grid-cols-[11rem_minmax(0,1fr)]">
        {/* In-page index */}
        <nav aria-label="Settings sections" className="hidden lg:sticky lg:top-8 lg:block">
          <ul className="space-y-0.5 border-l border-line">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="-ml-px block border-l border-transparent py-1.5 pl-4 text-sm text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="max-w-3xl space-y-6">
          {/* Restaurant profile */}
          <Card id="profile" className="scroll-mt-6">
            <CardHeader title="Restaurant profile" description="Shown on your public site and used for Google and AI search listings." />
            {profile ? (
              <>
                <CardBody className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Restaurant name" htmlFor="rp-name" required>
                      <Input id="rp-name" value={profile.name} onChange={(e) => setP({ name: e.target.value })} />
                    </Field>
                    <Field label="Legal name" htmlFor="rp-legal">
                      <Input id="rp-legal" value={profile.legalName} onChange={(e) => setP({ legalName: e.target.value })} />
                    </Field>
                    <Field label="Description" htmlFor="rp-desc" className="sm:col-span-2" hint="One or two sentences. Shown on the home page.">
                      <Textarea id="rp-desc" rows={2} value={profile.description} onChange={(e) => setP({ description: e.target.value })} aria-describedby="rp-desc-hint" />
                    </Field>
                    <Field label="Phone" htmlFor="rp-phone">
                      <Input id="rp-phone" type="tel" value={profile.telephone} onChange={(e) => setP({ telephone: e.target.value })} />
                    </Field>
                    <div className="grid grid-cols-[6rem_1fr] gap-4">
                      <Field label="Price range" htmlFor="rp-price">
                        <Input id="rp-price" value={profile.priceRange} onChange={(e) => setP({ priceRange: e.target.value })} placeholder="฿฿" />
                      </Field>
                      <Field label="Cuisine" htmlFor="rp-cuisine" hint="Separate with commas.">
                        <Input id="rp-cuisine" value={cuisineStr} onChange={(e) => setCuisineStr(e.target.value)} placeholder="Thai, Isan" aria-describedby="rp-cuisine-hint" />
                      </Field>
                    </div>
                  </div>

                  <fieldset className="space-y-4 border-t border-line pt-5">
                    <legend className="sr-only">Address</legend>
                    <p className="text-sm font-semibold text-fg">Address</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Street" htmlFor="rp-street" className="sm:col-span-2">
                        <Input id="rp-street" value={profile.address.streetAddress} onChange={(e) => setAddr({ streetAddress: e.target.value })} />
                      </Field>
                      <Field label="City / district" htmlFor="rp-city">
                        <Input id="rp-city" value={profile.address.addressLocality} onChange={(e) => setAddr({ addressLocality: e.target.value })} />
                      </Field>
                      <Field label="Province / region" htmlFor="rp-region">
                        <Input id="rp-region" value={profile.address.addressRegion} onChange={(e) => setAddr({ addressRegion: e.target.value })} />
                      </Field>
                      <Field label="Postal code" htmlFor="rp-postal">
                        <Input id="rp-postal" value={profile.address.postalCode} onChange={(e) => setAddr({ postalCode: e.target.value })} />
                      </Field>
                      <Field label="Country code" htmlFor="rp-country" hint="Two letters, e.g. TH.">
                        <Input id="rp-country" value={profile.address.addressCountry} onChange={(e) => setAddr({ addressCountry: e.target.value })} maxLength={2} aria-describedby="rp-country-hint" />
                      </Field>
                      <Field label="Latitude" htmlFor="rp-lat" hint="Used for the delivery distance.">
                        <Input id="rp-lat" type="number" step="0.0001" className="tabular-nums" value={profile.geo.latitude}
                          onChange={(e) => setP({ geo: { ...profile.geo, latitude: parseFloat(e.target.value) } })} aria-describedby="rp-lat-hint" />
                      </Field>
                      <Field label="Longitude" htmlFor="rp-lng">
                        <Input id="rp-lng" type="number" step="0.0001" className="tabular-nums" value={profile.geo.longitude}
                          onChange={(e) => setP({ geo: { ...profile.geo, longitude: parseFloat(e.target.value) } })} />
                      </Field>
                    </div>
                  </fieldset>

                  <fieldset className="space-y-3 border-t border-line pt-5">
                    <legend className="sr-only">Opening hours</legend>
                    <div>
                      <p className="text-sm font-semibold text-fg">Opening hours</p>
                      <p className="text-xs text-fg-muted">Online orders are only accepted in these hours, if that is switched on below.</p>
                    </div>
                    {profile.openingHours.length === 0 && <p className="text-sm text-fg-muted">No opening hours yet.</p>}
                    <ul className="space-y-2">
                      {profile.openingHours.map((h, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface-muted/40 p-3">
                          <DayPicker
                            value={Array.isArray(h.dayOfWeek) ? h.dayOfWeek : String(h.dayOfWeek).split(',').map((d) => d.trim())}
                            onChange={(days) => setHour(i, { dayOfWeek: days })}
                          />
                          <div className="flex items-center gap-2">
                            <Input type="time" aria-label="Opens" className="!h-9 !w-[7.5rem] tabular-nums" value={h.opens} onChange={(e) => setHour(i, { opens: e.target.value })} />
                            <span className="text-fg-muted">–</span>
                            <Input type="time" aria-label="Closes" className="!h-9 !w-[7.5rem] tabular-nums" value={h.closes} onChange={(e) => setHour(i, { closes: e.target.value })} />
                          </div>
                          <IconButton
                            icon={Trash2}
                            label="Remove these hours"
                            size="sm"
                            onClick={() => removeHour(i)}
                            className="ml-auto hover:!bg-danger-soft hover:!text-danger"
                          />
                        </li>
                      ))}
                    </ul>
                    <Button variant="secondary" size="sm" icon={Plus} onClick={addHour}>Add hours</Button>
                  </fieldset>

                  <Field label="Social and other links" htmlFor="rp-links" hint="One per line, optional. Facebook, Instagram, LINE, Google Maps…" className="border-t border-line pt-5">
                    <Textarea id="rp-links" rows={2} value={sameAsStr} onChange={(e) => setSameAsStr(e.target.value)} placeholder="https://instagram.com/yourrestaurant" aria-describedby="rp-links-hint" />
                  </Field>

                  {profileError && <Alert tone="danger">{profileError}</Alert>}
                </CardBody>
                <CardFooter>
                  <Button onClick={saveProfile} loading={savingProfile}>Save profile</Button>
                </CardFooter>
              </>
            ) : (
              <LoadingBlock label="Loading profile…" />
            )}
          </Card>

          {/* Online ordering */}
          <Card id="ordering" className="scroll-mt-6">
            <CardHeader title="Online ordering" />
            <CardBody>
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-sm font-medium text-fg">Only accept orders during opening hours</p>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    Uses the opening hours in the restaurant profile. Turn off for testing outside opening hours.
                  </p>
                </div>
                <Switch
                  checked={hoursEnforced}
                  label="Only accept orders during opening hours"
                  hideLabel
                  onChange={async (on) => {
                    try {
                      await setOrdering({ hoursEnforced: on }).unwrap();
                      saved(on ? 'Orders are now accepted only during opening hours' : 'Orders are now accepted at any time');
                    } catch (err) {
                      failed('Could not change online ordering', err);
                    }
                  }}
                />
              </div>
            </CardBody>
          </Card>

          <PaymentSettingsSection id="payments" onSaved={saved} />

          {/* Tax */}
          <Card id="tax" className="scroll-mt-6">
            <CardHeader title="Tax" description="VAT included in menu prices. Shown on the customer's receipt." />
            <CardBody>
              <Field label="VAT rate (%)" htmlFor="tax-rate">
                <Input
                  id="tax-rate"
                  type="number" min="0" max="100" step="0.1"
                  value={taxPct}
                  onChange={(e) => setTaxPct(e.target.value)}
                  className="!w-28 tabular-nums"
                />
              </Field>
            </CardBody>
            <CardFooter>
              <Button onClick={saveTax} loading={savingTax}>Save tax rate</Button>
            </CardFooter>
          </Card>

          {/* Delivery */}
          <Card id="delivery" className="scroll-mt-6">
            <CardHeader title="Delivery fees" description="The fee is worked out from the distance between the restaurant and the customer." />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              {[
                { id: 'fee-base', label: 'Base fee (฿)', value: baseFee, set: setBaseFee },
                { id: 'fee-km', label: 'Per km beyond the free zone (฿)', value: feePerKm, set: setFeePerKm },
                { id: 'fee-free', label: 'Free zone (km)', value: freeKm, set: setFreeKm },
                { id: 'fee-max', label: 'Max delivery distance (km)', value: maxKm, set: setMaxKm, hint: '0 = no limit.' },
              ].map(({ id, label, value, set, hint }) => (
                <Field key={id} label={label} htmlFor={id} hint={hint}>
                  <Input
                    id={id}
                    type="number" min="0" step="0.01"
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    className="tabular-nums"
                    aria-describedby={hint ? `${id}-hint` : undefined}
                  />
                </Field>
              ))}
            </CardBody>
            <CardFooter>
              <Button onClick={saveDelivery} loading={savingDelivery}>Save delivery fees</Button>
            </CardFooter>
          </Card>

          {/* Staff */}
          <Card id="staff" className="scroll-mt-6 overflow-hidden">
            <CardHeader
              title="Staff accounts"
              description="People who can work the orders screen. Accounts are deactivated, never deleted."
              actions={<Button size="sm" icon={UserPlus} onClick={() => { setStaffError(''); setStaffOpen(true); }}>Add staff</Button>}
            />
            <Table>
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH className="hidden sm:table-cell">Email</TH>
                  <TH>Role</TH>
                  <TH>Status</TH>
                  <TH numeric><span className="sr-only">Actions</span></TH>
                </tr>
              </THead>
              <TBody>
                {staff.map((s) => (
                  <TR key={s.id} className={cn(!s.isActive && 'bg-surface-muted/40')}>
                    <TD>
                      <p className={cn('font-medium', s.isActive ? 'text-fg' : 'text-fg-muted')}>{s.name}</p>
                      <p className="text-xs text-fg-muted">@{s.username}</p>
                    </TD>
                    <TD muted className="hidden sm:table-cell">{s.email ?? '—'}</TD>
                    <TD>
                      <Select
                        value={s.role}
                        aria-label={`Role of ${s.name}`}
                        onChange={async (e) => {
                          try {
                            await updateRole({ id: s.id, role: e.target.value }).unwrap();
                            saved(`${s.name} is now ${e.target.value === 'SUPER_ADMIN' ? 'a Super Admin' : 'Staff'}`);
                          } catch (err) {
                            failed('Could not change the role', err);
                          }
                        }}
                        className="w-36 [&>select]:h-8"
                      >
                        <option value="STAFF">Staff</option>
                        <option value="SUPER_ADMIN">Super Admin</option>
                      </Select>
                    </TD>
                    <TD>
                      <Badge tone={s.isActive ? 'success' : 'neutral'} dot>{s.isActive ? 'Active' : 'Deactivated'}</Badge>
                    </TD>
                    <TD numeric>
                      {s.isActive ? (
                        <Button variant="ghost" size="sm" className="!text-danger hover:!bg-danger-soft" onClick={() => setDeactivating(s)}>
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              await setStaffActive({ id: s.id, isActive: true }).unwrap();
                              saved(`${s.name} was reactivated`);
                            } catch (err) {
                              failed('Could not reactivate the account', err);
                            }
                          }}
                        >
                          Reactivate
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      </div>

      {/* Add staff */}
      <Dialog
        open={staffOpen}
        onClose={() => setStaffOpen(false)}
        dismissOnBackdrop={false}
        title="Add staff account"
        description="They sign in with the username and password you set here."
        footer={
          <>
            <Button variant="ghost" onClick={() => setStaffOpen(false)}>Cancel</Button>
            <Button type="submit" form="staff-form" loading={creatingStaff}>Create account</Button>
          </>
        }
      >
        <form id="staff-form" onSubmit={handleCreateStaff} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="st-name" required>
            <Input id="st-name" data-autofocus value={newStaff.name} onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })} required />
          </Field>
          <Field label="Username" htmlFor="st-username" required hint="3–32 letters, numbers, dot, underscore or dash.">
            <Input
              id="st-username"
              value={newStaff.username}
              onChange={(e) => setNewStaff({ ...newStaff, username: e.target.value })}
              required
              pattern="[A-Za-z0-9._\-]{3,32}"
              title="3-32 characters: letters, numbers, dot, underscore or dash"
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby="st-username-hint"
            />
          </Field>
          <Field label="Email" htmlFor="st-email" hint="Optional.">
            <Input id="st-email" type="email" value={newStaff.email} onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })} aria-describedby="st-email-hint" />
          </Field>
          <Field label="Role" htmlFor="st-role">
            <Select id="st-role" value={newStaff.role} onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value as 'STAFF' | 'SUPER_ADMIN' })}>
              <option value="STAFF">Staff</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </Select>
          </Field>
          <Field label="Password" htmlFor="st-password" required hint="At least 8 characters.">
            <PasswordInput
              id="st-password"
              value={newStaff.password}
              onChange={(v) => setNewStaff({ ...newStaff, password: v })}
              required
              minLength={8}
              autoComplete="new-password"
              aria-describedby="st-password-hint"
            />
          </Field>
          <Field label="Confirm password" htmlFor="st-confirm" required error={passwordsDiffer ? 'Passwords do not match' : undefined}>
            <PasswordInput
              id="st-confirm"
              value={newStaff.confirmPassword}
              onChange={(v) => setNewStaff({ ...newStaff, confirmPassword: v })}
              invalid={passwordsDiffer}
              required
              autoComplete="new-password"
            />
          </Field>
          {staffError && <Alert tone="danger" className="sm:col-span-2">{staffError}</Alert>}
        </form>
      </Dialog>

      {/* Deactivate */}
      <Dialog
        open={!!deactivating}
        onClose={() => setDeactivating(null)}
        size="sm"
        title={`Deactivate ${deactivating?.name ?? ''}?`}
        description="They are signed out at once and cannot sign in again. Their past orders and history stay. You can reactivate them later."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeactivating(null)} data-autofocus>Keep active</Button>
            <Button
              variant="danger"
              loading={changingActive}
              onClick={async () => {
                if (!deactivating) return;
                try {
                  await setStaffActive({ id: deactivating.id, isActive: false }).unwrap();
                  saved(`${deactivating.name} was deactivated`);
                } catch (err) {
                  failed('Could not deactivate the account', err);
                }
                setDeactivating(null);
              }}
            >
              Deactivate
            </Button>
          </>
        }
      />
    </PageContainer>
  );
}
