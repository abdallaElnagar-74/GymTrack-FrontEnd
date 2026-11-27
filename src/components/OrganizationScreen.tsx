import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useSession, type Api } from '../api/SessionContext';
import type { components } from '../api/platform-schema';
import { Button } from './ui';
import { t, locale } from '../i18n';
import { theme } from '../theme';
import { reportError } from '../utils/feedback';
import { confirm } from '../utils/confirm';

type S = components['schemas'];
type Member = S['MemberDto'];
type Kind = 'employee' | 'client';
const box = { padding: 16, marginBottom: 12, borderRadius: 16, backgroundColor: theme.card, gap: 10 };

function Field({ label, value, change, disabled = false, phone = false }: { label: string; value: string; change?: (s: string) => void; disabled?: boolean; phone?: boolean }) {
  return <View style={{ gap: 6 }}><Text style={{ color: theme.muted }}>{label}</Text><TextInput accessibilityLabel={label}
    editable={!disabled} value={value} onChangeText={change} keyboardType={phone ? 'phone-pad' : 'default'} autoCapitalize="none"
    style={{ color: disabled ? theme.muted : theme.text, backgroundColor: theme.input, borderColor: theme.border, borderWidth: 1, borderRadius: 12, minHeight: 48, padding: 12 }} /></View>;
}
function Choices({ options, value, change }: { options: { id: string; label: string }[]; value: string; change: (id: string) => void }) {
  return <ScrollView horizontal contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
    {options.map(o => <Button key={o.id} title={o.label} variant={o.id === value ? 'primary' : 'secondary'} onPress={() => change(o.id)} />)}
  </ScrollView>;
}
function Sheet({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: 30 }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }}>
      <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800' }}>{title}</Text>{children}<Button title={t('Close')} variant="secondary" onPress={close} />
    </ScrollView></View>
  </Modal>;
}
const roleName = (r: S['OrgRoleDto']) => locale.startsWith('ar') ? r.nameAr : r.nameEn;
const date = (s: string) => new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString(locale);
function subscriptionStatus(s: string) {
  return s === 'active' ? t('Active subscription') : s === 'scheduled' ? t('Scheduled subscription') : s === 'cancelled' ? t('Cancelled subscription') : t('Expired subscription');
}

export default function OrganizationScreen() {
  const { platformApi, organizationApi } = useSession();
  const [workspaces, setWorkspaces] = useState<S['WorkspaceDto'][]>([]);
  const [workspace, setWorkspace] = useState('');
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState('');
  const load = useCallback(async () => {
    try { setWorkspaces((await platformApi.get<S['WorkspaceDto'][]>('/auth/workspaces')).filter(w => w.kind !== 'personal')); setLoaded(true); setError(false); }
    catch (e) { setError(true); reportError(e); }
  }, [platformApi]);
  // load updates state only after the server response; this effect starts the initial fetch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const api = useMemo(() => workspace ? organizationApi(workspace) : null, [organizationApi, workspace]);
  return <View style={{ flex: 1, backgroundColor: theme.bg }}>
    <View style={{ paddingHorizontal: 16 }}><Choices value={workspace} change={setWorkspace} options={workspaces.map(w => ({ id: w.id, label: w.name }))} /></View>
    {api ? <Organization key={workspace} api={api} /> : <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
      {!loaded && !error && <ActivityIndicator color={theme.accent} />}
      {error ? <Button title={t('Try again')} onPress={load} /> : <Text style={{ color: theme.muted }}>{workspaces.length ? t('Choose an organization') : t('No organization memberships yet.')}</Text>}
      <Field label={t('Invitation link or code')} value={code} change={setCode} />
      <Button title={t('Accept invitation')} disabled={!code.trim()} onPress={async () => {
        const token = code.trim().includes('/invite/') ? code.trim().split('/invite/')[1].split(/[?#]/)[0] : code.trim();
        await platformApi.post('/invitations/accept', { token: decodeURIComponent(token) }); setCode(''); await load();
      }} />
    </ScrollView>}
    {!!workspace && <View style={{ padding: 12 }}><Button title={t('Choose another organization')} variant="secondary" onPress={() => setWorkspace('')} /></View>}
  </View>;
}

function Organization({ api }: { api: Api }) {
  const [org, setOrg] = useState<S['OrganizationDto']>();
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<S['OrgRoleDto'][]>([]);
  const [subscriptions, setSubscriptions] = useState<S['SubscriptionDto'][]>([]);
  const [invitations, setInvitations] = useState<S['InvitationDto'][]>([]);
  const [mine, setMine] = useState<S['MyMembershipDto']>();
  const [tab, setTab] = useState('employee');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [add, setAdd] = useState(false);
  const [invite, setInvite] = useState(false);
  const [subscription, setSubscription] = useState<Member | null>(null);
  const load = useCallback(async () => {
    try {
      const o = await api.get<S['OrganizationDto']>('/organization'); setOrg(o); setError(false);
      const permissions = o.myPermissions;
      if (permissions.includes('member.view')) {
        const [m, r, s] = await Promise.all([api.get<Member[]>('/members'), api.get<S['OrgRoleDto'][]>('/roles'), api.get<S['SubscriptionDto'][]>('/member-subscriptions')]);
        setMembers(m); setRoles(r); setSubscriptions(s);
      } else setMine(await api.get<S['MyMembershipDto']>('/members/me'));
      if (permissions.includes('member.invite.staff') || permissions.includes('member.invite.client')) setInvitations(await api.get<S['InvitationDto'][]>('/invitations'));
    } catch (e) { setError(true); reportError(e); } finally { setBusy(false); }
  }, [api]);
  // load updates state only after the server response; this effect starts the initial fetch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const canView = org?.myPermissions.includes('member.view');
  const canInvite = org?.myPermissions.some(p => p === 'member.invite.staff' || p === 'member.invite.client');
  const canAdd = org?.myPermissions.includes(tab === 'client' ? 'member.invite.client' : 'member.invite.staff');
  const canManage = org?.myPermissions.includes('member.manage');
  if (!org) return <View style={box}>{error ? <Button title={t('Try again')} onPress={load} /> : <ActivityIndicator color={theme.accent} />}</View>;
  if (!canView) return <ScrollView contentContainerStyle={{ padding: 16 }}><View style={box}>
    <Text style={{ color: theme.text, fontSize: 20 }}>{org.name}</Text>
    <Text style={{ color: theme.muted }}>{mine?.kind === 'client' ? t('Membership number') : t('Employment number')}</Text>
    <Text style={{ color: theme.accent }}>{mine?.number ?? '—'}</Text>
    {mine?.kind === 'client' && (mine.subscriptions.length ? mine.subscriptions.map(s => <SubscriptionSummary key={s.id} item={s} />) : <Text style={{ color: theme.muted }}>{t('No subscription')}</Text>)}
    <Button title={t('Refresh')} onPress={load} />
  </View></ScrollView>;
  const rows = members.filter(m => m.kind === tab && `${m.displayName} ${m.email} ${m.phone} ${m.number}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <View style={{ flex: 1, paddingHorizontal: 16 }}>
    <Choices value={tab} change={v => { setTab(v); setSearch(''); }} options={[
      { id: 'employee', label: t('Employees') }, { id: 'client', label: t('Clients') }, ...(canInvite ? [{ id: 'invitations', label: t('Invitations') }] : []),
    ]} />
    {error && <Button title={t('Try again')} onPress={load} />}
    {tab === 'invitations' ? <ScrollView contentContainerStyle={{ gap: 12, paddingVertical: 12 }}>
      <Button title={t('Create invitation')} onPress={() => setInvite(true)} />
      {invitations.map(i => <View key={i.id} style={box}><Text style={{ color: theme.text }}>{i.note || roleName(roles.find(r => r.key === i.role) ?? { nameAr: i.role, nameEn: i.role } as S['OrgRoleDto'])}</Text>
        <Text style={{ color: theme.muted }}>{date(i.expiresAt)}</Text><Button title={t('Cancel invitation')} variant="secondary" onPress={() => confirm(t('Cancel invitation'), t('Cancel this invitation?'), t('Confirm'), () => { void api.del(`/invitations/${i.id}`).then(load).catch(reportError); })} /></View>)}
    </ScrollView> : <FlatList data={rows} keyExtractor={m => m.membershipId} refreshing={busy} onRefresh={load} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingVertical: 12, gap: 12 }} ListHeaderComponent={<View style={{ gap: 12, marginBottom: 12 }}>
        {canAdd && <Button title={t('Add new member')} onPress={() => setAdd(true)} />}
        <Field label={t('Search name, phone or number')} value={search} change={setSearch} />
      </View>} ListEmptyComponent={!busy && !error ? <Text style={{ color: theme.muted }}>{t('No matching members.')}</Text> : undefined}
      renderItem={({ item: m }) => <View style={box}>
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>{m.displayName || m.email}</Text>
        <Text style={{ color: theme.accent }}>{m.number ?? '—'}</Text><Text style={{ color: theme.muted }}>{m.phone ?? '—'}</Text>
        {m.activationPending && <Text style={{ color: theme.muted }}>{t('Account activation pending')}</Text>}
        {tab === 'client' && (subscriptions.some(s => s.membershipId === m.membershipId) ? subscriptions.filter(s => s.membershipId === m.membershipId).map(s => <SubscriptionSummary key={s.id} item={s} />) : <Text style={{ color: theme.muted }}>{t('No subscription')}</Text>)}
        {tab === 'client' && canManage && <Button title={t('Manage subscriptions')} variant="secondary" onPress={() => setSubscription(m)} />}
      </View>} />}
    {add && <AddMember api={api} kind={tab === 'client' ? 'client' : 'employee'} org={org} roles={roles} close={() => setAdd(false)} saved={load} />}
    {invite && <Invite api={api} org={org} roles={roles} members={members} close={() => setInvite(false)} saved={load} />}
    {subscription && <Subscriptions api={api} member={subscription} items={subscriptions.filter(s => s.membershipId === subscription.membershipId)} close={() => setSubscription(null)} saved={load} />}
  </View>;
}

function SubscriptionSummary({ item: s }: { item: S['SubscriptionDto'] }) {
  return <View style={{ gap: 4 }}><Text style={{ color: theme.text }}>{s.name} · {subscriptionStatus(s.status)}</Text>
    <Text style={{ color: theme.muted }}>{date(s.startsOn)} — {date(s.endsOn)}</Text>
    {s.status === 'active' && <Text style={{ color: theme.accent }}>{t('{n} days remaining', { n: s.remainingDays })}</Text>}
  </View>;
}
function AddMember({ api, kind: initial, org, roles, close, saved }: { api: Api; kind: Kind; org: S['OrganizationDto']; roles: S['OrgRoleDto'][]; close: () => void; saved: () => Promise<void> }) {
  const [kind, setKind] = useState<Kind>(initial);
  const [reservation, setReservation] = useState<S['ReservedMemberNumberDto']>();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(false);
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState('');
  const [role, setRole] = useState(initial === 'client' ? 'client' : ''); const [branch, setBranch] = useState('');
  useEffect(() => {
    let current = true;
    api.post<S['ReservedMemberNumberDto']>('/members/number-reservations', { kind }).then(r => { if (current) setReservation(r); }).catch(e => { if (current) { setError(true); reportError(e); } });
    return () => { current = false; };
  }, [api, kind, attempt]);
  const scope = roles.find(r => r.key === role)?.scope;
  return <Sheet title={t('Add new member')} close={close}>
    <Choices value={kind} change={v => { setReservation(undefined); setError(false); setKind(v as Kind); setRole(v === 'client' ? 'client' : ''); setBranch(''); }} options={[
      ...(org.myPermissions.includes('member.invite.staff') ? [{ id: 'employee', label: t('Employee') }] : []),
      ...(org.myPermissions.includes('member.invite.client') ? [{ id: 'client', label: t('Client') }] : []),
    ]} />
    <Field label={kind === 'client' ? t('Membership number') : t('Employment number')} value={reservation?.number ?? t('Generating number…')} disabled />
    {error && <Button title={t('Try again')} onPress={() => { setReservation(undefined); setError(false); setAttempt(a => a + 1); }} />}
    <Field label={t('Name')} value={name} change={setName} /><Field label={t('Phone with country code')} value={phone} change={setPhone} phone />
    <Field label={t('Email (optional)')} value={email} change={setEmail} />
    {kind === 'employee' && <Choices value={role} change={setRole} options={roles.filter(r => r.key !== 'client' && r.key !== 'individual').map(r => ({ id: r.key, label: roleName(r) }))} />}
    {scope === 'branch' && <Choices value={branch} change={setBranch} options={[{ id: '', label: t('All branches') }, ...org.branches.filter(b => b.status === 'active').map(b => ({ id: b.id, label: b.name }))]} />}
    <Text style={{ color: theme.muted }}>{t('Save the member now. Activate their account later from Invitations.')}</Text>
    <Button title={t('Save')} disabled={!reservation || !name.trim() || !phone.trim() || !role} onPress={async () => {
      if (!reservation) return;
      if (Date.parse(reservation.expiresAt) <= Date.now()) { setAttempt(a => a + 1); return; }
      await api.post('/members', { reservationId: reservation.id, kind, displayName: name.trim(), phone: phone.replace(/[\s()-]/g, ''), email: email.trim() || null, role, branchId: scope === 'branch' ? branch || null : null });
      await saved(); close();
    }} />
  </Sheet>;
}

function Invite({ api, org, roles, members, close, saved }: { api: Api; org: S['OrganizationDto']; roles: S['OrgRoleDto'][]; members: Member[]; close: () => void; saved: () => Promise<void> }) {
  const [target, setTarget] = useState(''); const [role, setRole] = useState(''); const [branch, setBranch] = useState('');
  const [token, setToken] = useState('');
  const scope = roles.find(r => r.key === role)?.scope;
  return <Sheet title={t('Create invitation')} close={close}>
    {token ? <><Field label={t('Invitation link or code')} value={token} disabled /><Button title={t('Share invitation')} onPress={() => Share.share({ message: t('Invitation code: {code}', { code: token }) })} />
      <Text style={{ color: theme.muted }}>{t('Paste this code in My organizations to accept the invitation.')}</Text></> : <>
      <Text style={{ color: theme.muted }}>{t('Activate an existing member (optional)')}</Text>
      <Choices value={target} change={id => { setTarget(id); const m = members.find(m => m.membershipId === id); setRole(m?.roles[0]?.role ?? ''); setBranch(m?.roles[0]?.branchId ?? ''); }} options={[{ id: '', label: t('New person') }, ...members.filter(m => m.activationPending && m.status === 'active').map(m => ({ id: m.membershipId, label: m.displayName || m.number || '' }))]} />
      {!target && <Choices value={role} change={setRole} options={roles.filter(r => r.key !== 'individual' && org.myPermissions.includes(r.key === 'client' ? 'member.invite.client' : 'member.invite.staff')).map(r => ({ id: r.key, label: roleName(r) }))} />}
      {!target && scope === 'branch' && <Choices value={branch} change={setBranch} options={[{ id: '', label: t('All branches') }, ...org.branches.filter(b => b.status === 'active').map(b => ({ id: b.id, label: b.name }))]} />}
      <Text style={{ color: theme.muted }}>{t('Invitation expires after 7 days.')}</Text>
      <Button title={t('Create invitation')} disabled={!role} onPress={async () => { const r = await api.post<S['CreatedInvitationDto']>('/invitations', { membershipId: target || null, role, branchId: scope === 'branch' ? branch || null : null, validDays: 7 }); setToken(r.token); await saved(); }} />
    </>}
  </Sheet>;
}
function Subscriptions({ api, member, items, close, saved }: { api: Api; member: Member; items: S['SubscriptionDto'][]; close: () => void; saved: () => Promise<void> }) {
  const [name, setName] = useState(''); const [start, setStart] = useState(''); const [end, setEnd] = useState('');
  return <Sheet title={t('Manage subscriptions')} close={close}>
    {items.map(s => <View key={s.id} style={box}><SubscriptionSummary item={s} />{s.status !== 'cancelled' && <Button title={t('Cancel subscription')} variant="secondary" onPress={async () => {
      confirm(t('Cancel subscription'), t('Cancel this subscription?'), t('Confirm'), () => { void api.del(`/member-subscriptions/${s.id}`).then(saved).catch(reportError); });
    }} />}</View>)}
    <Field label={t('Subscription name')} value={name} change={setName} /><Field label={t('Start date (YYYY-MM-DD)')} value={start} change={setStart} /><Field label={t('End date (YYYY-MM-DD)')} value={end} change={setEnd} />
    <Button title={t('Save')} disabled={!name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)} onPress={async () => {
      await api.post('/member-subscriptions', { membershipId: member.membershipId, name: name.trim(), startsOn: start, endsOn: end }); await saved(); setName(''); setStart(''); setEnd('');
    }} />
  </Sheet>;
}
