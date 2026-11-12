'use client';

import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiErrorMessage } from '@/lib/localized';
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
} from '../../../../src/api/apiSlice';
import { useRequireRole } from '../../../../src/routes/useAuthGuard';
import { useUnsavedChanges } from '../../../../src/lib/useUnsavedChanges';
import PaymentSettingsSection from '../../../../src/features/admin/settings/PaymentSettingsSection';
import {
  Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader, Dialog, Field, IconButton, Input, LoadingBlock, PageContainer,
  PageHeader, Select, Switch, Table, TBody, TD, TH, THead, TR, Textarea, cn, useToast,
} from '../../../../src/components/ui';

const SECTIONS = ['profile', 'ordering', 'payments', 'tax', 'delivery', 'staff'] as const;

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** Seven toggle buttons for the days an opening-hours row applies to (values stay English: they are data). */
function DayPicker({ value, onChange }: { value: string[]; onChange: (days: string[]) => void }) {
  const t = useTranslations('settings');
  const tdays = useTranslations('closed.days');
  const tshort = useTranslations('home.days');
  return (
    <div role="group" aria-label={t('days')} className="flex gap-1">
      {DAYS.map((d) => {
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            aria-label={tdays(d)}
            title={tdays(d)}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : DAYS.filter((x) => x === d || value.includes(x)))}
            className={cn(
              'h-9 w-10 rounded-control border text-xs font-medium transition-colors duration-150',
              on ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg',
            )}
          >
            {tshort(d)}
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
  const t = useTranslations('settings');
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
          label={show ? t('hidePassword') : t('showPassword')}
          size="sm"
          onClick={() => setShow((v) => !v)}
        />
      </span>
    </div>
  );
}

const EMPTY_STAFF = { name: '', username: '', email: '', password: '', confirmPassword: '', role: 'STAFF' as 'STAFF' | 'SUPER_ADMIN' };

export default function SettingsPage() {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const locale = useLocale();
  const tnav = useTranslations('nav');
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

  // Typed values that differ from what the server has (saving refetches and resets them).
  const dirty = Boolean(
    (settings && (
      taxPct !== String(Math.round(settings.TAX_RATE * 100))
      || baseFee !== String(settings.DELIVERY_BASE_FEE)
      || feePerKm !== String(settings.DELIVERY_FEE_PER_KM)
      || freeKm !== String(settings.DELIVERY_FREE_KM)
      || maxKm !== String(settings.DELIVERY_MAX_KM)
    ))
    || (restaurant && profile && (
      JSON.stringify(profile) !== JSON.stringify(restaurant)
      || cuisineStr !== restaurant.servesCuisine.join(', ')
      || sameAsStr !== restaurant.sameAs.join('\n')
    )),
  );
  useUnsavedChanges(dirty);

  const saved = (title: string) => toast({ title });
  const failed = (title: string, err?: unknown) =>
    toast({ tone: 'error', title, description: apiErrorMessage(err, locale, t('checkValues')) });

  const saveTax = async () => {
    try {
      await setTax({ value: parseFloat(taxPct) / 100 }).unwrap();
      saved(t('taxSaved'));
    } catch (err) {
      failed(t('taxFailed'), err);
    }
  };

  const saveDelivery = async () => {
    try {
      await setDelivery({ baseFee: parseFloat(baseFee), feePerKm: parseFloat(feePerKm), freeKm: parseFloat(freeKm), maxKm: parseFloat(maxKm) }).unwrap();
      saved(t('deliverySaved'));
    } catch (err) {
      failed(t('deliveryFailed'), err);
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
    if (!profile.name.trim()) { setProfileError(t('nameRequired')); return; }
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
      saved(t('profileSaved'));
    } catch {
      setProfileError(t('profileFailed'));
    }
  };

  const passwordsDiffer = Boolean(newStaff.confirmPassword) && newStaff.password !== newStaff.confirmPassword;

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffError('');
    if (newStaff.password !== newStaff.confirmPassword) {
      setStaffError(t('passwordsDiffer'));
      return;
    }
    try {
      const { confirmPassword: _, email, ...rest } = newStaff;
      await createStaff({ ...rest, email: email.trim() || undefined }).unwrap();
      saved(t('staffCreated', { name: newStaff.name }));
      setNewStaff(EMPTY_STAFF);
      setStaffOpen(false);
    } catch (err) {
      // Show the server's reason (e.g. "Username already taken") when there is one.
      setStaffError(apiErrorMessage(err, locale, t('staffFailed')));
    }
  };

  if (!ready) return null;
  if (isLoading) return <PageContainer><LoadingBlock label={t('loading')} /></PageContainer>;

  const hoursEnforced = (settings?.ORDERING_HOURS_ENFORCED ?? 1) !== 0;
  const roleName = (role: string) => tnav(`role.${role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'STAFF'}`);

  return (
    <PageContainer wide>
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />

      <div className="grid items-start gap-8 lg:grid-cols-[11rem_minmax(0,1fr)]">
        {/* In-page index */}
        <nav aria-label={t('sectionsLabel')} className="hidden lg:sticky lg:top-20 lg:block">
          <ul className="space-y-0.5 border-l border-line">
            {SECTIONS.map((s) => (
              <li key={s}>
                <a
                  href={`#${s}`}
                  className="-ml-px block border-l border-transparent py-1.5 pl-4 text-sm text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  {t(`section.${s}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="max-w-3xl space-y-6">
          {/* Restaurant profile */}
          <Card id="profile" className="scroll-mt-6 lg:scroll-mt-20">
            <CardHeader title={t('section.profile')} description={t('profileDescription')} />
            {profile ? (
              <>
                <CardBody className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('restaurantName')} htmlFor="rp-name" required>
                      <Input id="rp-name" value={profile.name} onChange={(e) => setP({ name: e.target.value })} />
                    </Field>
                    <Field label={t('legalName')} htmlFor="rp-legal">
                      <Input id="rp-legal" value={profile.legalName} onChange={(e) => setP({ legalName: e.target.value })} />
                    </Field>
                    <Field label={t('descriptionField')} htmlFor="rp-desc" className="sm:col-span-2" hint={t('descriptionHint')}>
                      <Textarea id="rp-desc" rows={2} value={profile.description} onChange={(e) => setP({ description: e.target.value })} aria-describedby="rp-desc-hint" />
                    </Field>
                    <Field label={t('phone')} htmlFor="rp-phone">
                      <Input id="rp-phone" type="tel" value={profile.telephone} onChange={(e) => setP({ telephone: e.target.value })} />
                    </Field>
                    <div className="grid grid-cols-[6rem_1fr] gap-4">
                      <Field label={t('priceRange')} htmlFor="rp-price">
                        <Input id="rp-price" value={profile.priceRange} onChange={(e) => setP({ priceRange: e.target.value })} placeholder="฿฿" />
                      </Field>
                      <Field label={t('cuisine')} htmlFor="rp-cuisine" hint={t('commaHint')}>
                        <Input id="rp-cuisine" value={cuisineStr} onChange={(e) => setCuisineStr(e.target.value)} placeholder="Thai, Isan" aria-describedby="rp-cuisine-hint" />
                      </Field>
                    </div>
                  </div>

                  <fieldset className="space-y-4 border-t border-line pt-5">
                    <legend className="sr-only">{t('address')}</legend>
                    <p className="text-sm font-semibold text-fg">{t('address')}</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={t('street')} htmlFor="rp-street" className="sm:col-span-2">
                        <Input id="rp-street" value={profile.address.streetAddress} onChange={(e) => setAddr({ streetAddress: e.target.value })} />
                      </Field>
                      <Field label={t('city')} htmlFor="rp-city">
                        <Input id="rp-city" value={profile.address.addressLocality} onChange={(e) => setAddr({ addressLocality: e.target.value })} />
                      </Field>
                      <Field label={t('region')} htmlFor="rp-region">
                        <Input id="rp-region" value={profile.address.addressRegion} onChange={(e) => setAddr({ addressRegion: e.target.value })} />
                      </Field>
                      <Field label={t('postalCode')} htmlFor="rp-postal">
                        <Input id="rp-postal" value={profile.address.postalCode} onChange={(e) => setAddr({ postalCode: e.target.value })} />
                      </Field>
                      <Field label={t('countryCode')} htmlFor="rp-country" hint={t('countryHint')}>
                        <Input id="rp-country" value={profile.address.addressCountry} onChange={(e) => setAddr({ addressCountry: e.target.value })} maxLength={2} aria-describedby="rp-country-hint" />
                      </Field>
                      <Field label={t('latitude')} htmlFor="rp-lat" hint={t('latitudeHint')}>
                        <Input id="rp-lat" type="number" step="0.0001" className="tabular-nums" value={profile.geo.latitude}
                          onChange={(e) => setP({ geo: { ...profile.geo, latitude: parseFloat(e.target.value) } })} aria-describedby="rp-lat-hint" />
                      </Field>
                      <Field label={t('longitude')} htmlFor="rp-lng">
                        <Input id="rp-lng" type="number" step="0.0001" className="tabular-nums" value={profile.geo.longitude}
                          onChange={(e) => setP({ geo: { ...profile.geo, longitude: parseFloat(e.target.value) } })} />
                      </Field>
                    </div>
                  </fieldset>

                  <fieldset className="space-y-3 border-t border-line pt-5">
                    <legend className="sr-only">{t('openingHours')}</legend>
                    <div>
                      <p className="text-sm font-semibold text-fg">{t('openingHours')}</p>
                      <p className="text-xs text-fg-muted">{t('openingHoursHint')}</p>
                    </div>
                    {profile.openingHours.length === 0 && <p className="text-sm text-fg-muted">{t('noHours')}</p>}
                    <ul className="space-y-2">
                      {profile.openingHours.map((h, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface-muted/40 p-3">
                          <DayPicker
                            value={Array.isArray(h.dayOfWeek) ? h.dayOfWeek : String(h.dayOfWeek).split(',').map((d) => d.trim())}
                            onChange={(days) => setHour(i, { dayOfWeek: days })}
                          />
                          <div className="flex items-center gap-2">
                            <Input type="time" aria-label={t('opens')} className="!h-9 !w-[7.5rem] tabular-nums" value={h.opens} onChange={(e) => setHour(i, { opens: e.target.value })} />
                            <span className="text-fg-muted">–</span>
                            <Input type="time" aria-label={t('closes')} className="!h-9 !w-[7.5rem] tabular-nums" value={h.closes} onChange={(e) => setHour(i, { closes: e.target.value })} />
                          </div>
                          <IconButton
                            icon={Trash2}
                            label={t('removeHours')}
                            size="sm"
                            onClick={() => removeHour(i)}
                            className="ml-auto hover:!bg-danger-soft hover:!text-danger"
                          />
                        </li>
                      ))}
                    </ul>
                    <Button variant="secondary" size="sm" icon={Plus} onClick={addHour}>{t('addHours')}</Button>
                  </fieldset>

                  <Field label={t('links')} htmlFor="rp-links" hint={t('linksHint')} className="border-t border-line pt-5">
                    <Textarea id="rp-links" rows={2} value={sameAsStr} onChange={(e) => setSameAsStr(e.target.value)} placeholder="https://instagram.com/yourrestaurant" aria-describedby="rp-links-hint" />
                  </Field>

                  {profileError && <Alert tone="danger">{profileError}</Alert>}
                </CardBody>
                <CardFooter>
                  <Button onClick={saveProfile} loading={savingProfile}>{t('saveProfile')}</Button>
                </CardFooter>
              </>
            ) : (
              <LoadingBlock label={t('loadingProfile')} />
            )}
          </Card>

          {/* Online ordering */}
          <Card id="ordering" className="scroll-mt-6 lg:scroll-mt-20">
            <CardHeader title={t('section.ordering')} />
            <CardBody>
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-sm font-medium text-fg">{t('onlyDuringHours')}</p>
                  <p className="mt-0.5 text-xs text-fg-muted">{t('onlyDuringHoursHint')}</p>
                </div>
                <Switch
                  checked={hoursEnforced}
                  label={t('onlyDuringHours')}
                  hideLabel
                  onChange={async (on) => {
                    try {
                      await setOrdering({ hoursEnforced: on }).unwrap();
                      saved(on ? t('hoursOn') : t('hoursOff'));
                    } catch (err) {
                      failed(t('orderingFailed'), err);
                    }
                  }}
                />
              </div>
            </CardBody>
          </Card>

          <PaymentSettingsSection id="payments" onSaved={saved} />

          {/* Tax */}
          <Card id="tax" className="scroll-mt-6 lg:scroll-mt-20">
            <CardHeader title={t('section.tax')} description={t('taxDescription')} />
            <CardBody>
              <Field label={t('vatRate')} htmlFor="tax-rate">
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
              <Button onClick={saveTax} loading={savingTax}>{t('saveTax')}</Button>
            </CardFooter>
          </Card>

          {/* Delivery */}
          <Card id="delivery" className="scroll-mt-6 lg:scroll-mt-20">
            <CardHeader title={t('section.delivery')} description={t('deliveryDescription')} />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              {[
                { id: 'fee-base', label: t('baseFee'), value: baseFee, set: setBaseFee },
                { id: 'fee-km', label: t('perKm'), value: feePerKm, set: setFeePerKm },
                { id: 'fee-free', label: t('freeZone'), value: freeKm, set: setFreeKm },
                { id: 'fee-max', label: t('maxDistance'), value: maxKm, set: setMaxKm, hint: t('noLimitHint') },
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
              <Button onClick={saveDelivery} loading={savingDelivery}>{t('saveDelivery')}</Button>
            </CardFooter>
          </Card>

          {/* Staff */}
          <Card id="staff" className="scroll-mt-6 lg:scroll-mt-20 overflow-hidden">
            <CardHeader
              title={t('section.staff')}
              description={t('staffDescription')}
              actions={<Button size="sm" icon={UserPlus} onClick={() => { setStaffError(''); setStaffOpen(true); }}>{t('addStaff')}</Button>}
            />
            <Table>
              <THead>
                <tr>
                  <TH>{t('col.name')}</TH>
                  <TH className="hidden sm:table-cell">{t('col.email')}</TH>
                  <TH>{t('col.role')}</TH>
                  <TH>{t('col.status')}</TH>
                  <TH numeric><span className="sr-only">{t('col.actions')}</span></TH>
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
                        aria-label={t('roleOf', { name: s.name })}
                        onChange={async (e) => {
                          try {
                            await updateRole({ id: s.id, role: e.target.value }).unwrap();
                            saved(t('roleChanged', { name: s.name, role: roleName(e.target.value) }));
                          } catch (err) {
                            failed(t('roleFailed'), err);
                          }
                        }}
                        className="w-36 [&>select]:h-8"
                      >
                        <option value="STAFF">{roleName('STAFF')}</option>
                        <option value="SUPER_ADMIN">{roleName('SUPER_ADMIN')}</option>
                      </Select>
                    </TD>
                    <TD>
                      <Badge tone={s.isActive ? 'success' : 'neutral'} dot>{s.isActive ? t('active') : t('deactivated')}</Badge>
                    </TD>
                    <TD numeric>
                      {s.isActive ? (
                        <Button variant="ghost" size="sm" className="!text-danger hover:!bg-danger-soft" onClick={() => setDeactivating(s)}>
                          {t('deactivate')}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              await setStaffActive({ id: s.id, isActive: true }).unwrap();
                              saved(t('reactivated', { name: s.name }));
                            } catch (err) {
                              failed(t('reactivateFailed'), err);
                            }
                          }}
                        >
                          {t('reactivate')}
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
        title={t('addStaffTitle')}
        description={t('addStaffDescription')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setStaffOpen(false)}>{tc('cancel')}</Button>
            <Button type="submit" form="staff-form" loading={creatingStaff}>{t('createAccount')}</Button>
          </>
        }
      >
        <form id="staff-form" onSubmit={handleCreateStaff} className="grid gap-4 sm:grid-cols-2">
          <Field label={t('col.name')} htmlFor="st-name" required>
            <Input id="st-name" data-autofocus value={newStaff.name} onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })} required />
          </Field>
          <Field label={t('username')} htmlFor="st-username" required hint={t('usernameHint')}>
            <Input
              id="st-username"
              value={newStaff.username}
              onChange={(e) => setNewStaff({ ...newStaff, username: e.target.value })}
              required
              pattern="[A-Za-z0-9._\-]{3,32}"
              title={t('usernameHint')}
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby="st-username-hint"
            />
          </Field>
          <Field label={t('col.email')} htmlFor="st-email" hint={t('optional')}>
            <Input id="st-email" type="email" value={newStaff.email} onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })} aria-describedby="st-email-hint" />
          </Field>
          <Field label={t('col.role')} htmlFor="st-role">
            <Select id="st-role" value={newStaff.role} onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value as 'STAFF' | 'SUPER_ADMIN' })}>
              <option value="STAFF">{roleName('STAFF')}</option>
              <option value="SUPER_ADMIN">{roleName('SUPER_ADMIN')}</option>
            </Select>
          </Field>
          <Field label={t('password')} htmlFor="st-password" required hint={t('passwordHint')}>
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
          <Field label={t('confirmPassword')} htmlFor="st-confirm" required error={passwordsDiffer ? t('passwordsDiffer') : undefined}>
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
        title={t('deactivateTitle', { name: deactivating?.name ?? '' })}
        description={t('deactivateDescription')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeactivating(null)} data-autofocus>{t('keepActive')}</Button>
            <Button
              variant="danger"
              loading={changingActive}
              onClick={async () => {
                if (!deactivating) return;
                try {
                  await setStaffActive({ id: deactivating.id, isActive: false }).unwrap();
                  saved(t('deactivatedToast', { name: deactivating.name }));
                } catch (err) {
                  failed(t('deactivateFailed'), err);
                }
                setDeactivating(null);
              }}
            >
              {t('deactivate')}
            </Button>
          </>
        }
      />
    </PageContainer>
  );
}
