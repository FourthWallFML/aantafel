import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FolderArchive,
  Globe,
  Link2,
  LogIn,
  LogOut,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Share2,
  Shield,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  AdminRecord,
  FamilyMember,
  FamilyMemberStatus,
  FamilyRole,
  Recipe,
  RecipeComment,
  RecurringItem,
  SharedCookbook,
  ShoppingListState,
  StorageCategory,
  UserProfile,
} from '../types';
import {
  FullBackupPayload,
  downloadGithubActionsWorkflow,
  downloadJsonBackup,
  downloadManifestJson,
  downloadServiceWorkerJs,
  downloadStandaloneIndexHtml,
} from '../utils/githubPagesExport';
import { PWAInstallButton } from './PWAInstallButton';

type BeheerSubTab = 'delen' | 'admin' | 'publiceren';

interface AdminShareViewProps {
  userEmail: string | null;
  userUid: string | null;
  userDisplayName: string | null;
  isSignedIn: boolean;
  isAdmin: boolean;
  isBootstrappedAdmin: boolean;
  profile: UserProfile;
  recipes: Recipe[];
  commentsByRecipe: Record<string, RecipeComment[]>;
  shoppingState: ShoppingListState;
  recurringItems: RecurringItem[];
  familyMembers: FamilyMember[];
  sharedCookbooks: SharedCookbook[];
  adminRecords: AdminRecord[];
  onSignIn: () => void;
  onSignOut: () => void;
  onSeedRecipes?: () => Promise<void>;
  seedingRecipes?: boolean;
  onCreateNewRecipe?: () => void;
  onSaveProfile: (next: UserProfile) => Promise<void>;
  onEditRecipe: (recipe: Recipe) => void;
  onDeleteRecipe: (recipeId: string) => Promise<void>;
  onDeleteComment: (recipeId: string, commentId: string) => Promise<void>;
  onRemoveIngredientMemory: (key: string) => Promise<void>;
  onFlipIngredientMemory: (key: string, nextCat: StorageCategory) => Promise<void>;
  onAddFamilyMember: (data: {
    memberName: string;
    memberEmail: string;
    role: FamilyRole;
    canViewShoppingList: boolean;
    note: string;
  }) => Promise<void>;
  onUpdateFamilyMember: (
    member: FamilyMember,
    updates: Partial<Pick<FamilyMember, 'role' | 'status' | 'canViewShoppingList' | 'note'>>
  ) => Promise<void>;
  onDeleteFamilyMember: (memberId: string) => Promise<void>;
  onCreateOrSyncShareLink: (options: {
    existingShare?: SharedCookbook;
    recipeIds: string[];
    allowCopy: boolean;
    isActive: boolean;
  }) => Promise<void>;
  onToggleShareActive: (share: SharedCookbook) => Promise<void>;
  onDeleteShareLink: (shareCode: string) => Promise<void>;
  onPreviewShareLink: (share: SharedCookbook) => void;
  onAddAdminRecord: (data: { uid: string; email: string; displayName: string }) => Promise<void>;
  onRemoveAdminRecord: (adminUid: string) => Promise<void>;
  onImportBackup: (payload: FullBackupPayload) => Promise<number>;
}

const ROLE_LABELS: Record<FamilyRole, string> = {
  admin: 'Beheerder',
  editor: 'Medewerker',
  viewer: 'Lezer',
};

const STATUS_LABELS: Record<FamilyMemberStatus, string> = {
  active: 'Actief',
  pending: 'Uitgenodigd',
  revoked: 'Ingetrokken',
};

export const AdminShareView: React.FC<AdminShareViewProps> = ({
  userEmail,
  userUid,
  userDisplayName,
  isSignedIn,
  isAdmin,
  isBootstrappedAdmin,
  profile,
  recipes,
  commentsByRecipe,
  shoppingState,
  recurringItems,
  familyMembers,
  sharedCookbooks,
  adminRecords,
  onSignIn,
  onSignOut,
  onSeedRecipes,
  seedingRecipes,
  onCreateNewRecipe,
  onSaveProfile,
  onEditRecipe,
  onDeleteRecipe,
  onDeleteComment,
  onRemoveIngredientMemory,
  onFlipIngredientMemory,
  onAddFamilyMember,
  onUpdateFamilyMember,
  onDeleteFamilyMember,
  onCreateOrSyncShareLink,
  onToggleShareActive,
  onDeleteShareLink,
  onPreviewShareLink,
  onAddAdminRecord,
  onRemoveAdminRecord,
  onImportBackup,
}) => {
  const [subTab, setSubTab] = useState<BeheerSubTab>('delen');

  // Share link creation state
  const [shareAllowCopy, setShareAllowCopy] = useState(true);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedShopping, setCopiedShopping] = useState(false);

  // Family member form
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<FamilyRole>('editor');
  const [memberCanShop, setMemberCanShop] = useState(true);
  const [memberNote, setMemberNote] = useState('');
  const [memberError, setMemberError] = useState('');
  const [memberBusy, setMemberBusy] = useState(false);

  // Profile form (Admin tab)
  const [profileTitle, setProfileTitle] = useState(profile.cookbookTitle);
  const [profileSubtitle, setProfileSubtitle] = useState(profile.cookbookSubtitle);
  const [profileFamily, setProfileFamily] = useState(profile.familyName);
  const [profileAuthor, setProfileAuthor] = useState(profile.displayName);
  const [profileSaved, setProfileSaved] = useState(false);

  useEffect(() => {
    setProfileTitle(profile.cookbookTitle);
    setProfileSubtitle(profile.cookbookSubtitle);
    setProfileFamily(profile.familyName);
    setProfileAuthor(profile.displayName);
  }, [profile.cookbookTitle, profile.cookbookSubtitle, profile.familyName, profile.displayName]);

  // Admin moderation states
  const [confirmDeleteRecipeId, setConfirmDeleteRecipeId] = useState<string | null>(null);
  const [adminUidInput, setAdminUidInput] = useState('');
  const [adminEmailInput, setAdminEmailInput] = useState('');
  const [adminNameInput, setAdminNameInput] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);

  // Import/Export state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importMessage, setImportMessage] = useState('');
  const [exportingHtml, setExportingHtml] = useState(false);

  const allComments = useMemo(() => {
    const recipeMap = new Map(recipes.map((r) => [r.id, r.title]));
    const flat: (RecipeComment & { recipeTitle: string })[] = [];
    for (const [recipeId, list] of Object.entries(commentsByRecipe)) {
      for (const c of list) {
        flat.push({ ...c, recipeTitle: recipeMap.get(recipeId) || 'Recept' });
      }
    }
    return flat.sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [commentsByRecipe, recipes]);

  const memoryEntries = useMemo(
    () =>
      Object.entries(profile.ingredientMemory || {}).sort(([a], [b]) => a.localeCompare(b, 'nl')),
    [profile.ingredientMemory]
  );

  const buildShareUrl = (code: string) => {
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}?share=${encodeURIComponent(code)}`;
  };

  const handleCopyShareUrl = async (code: string) => {
    try {
      await navigator.clipboard.writeText(buildShareUrl(code));
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // Clipboard blocked in restricted context
    }
  };

  const buildShoppingSummaryText = () => {
    const selectedMap = new Map(shoppingState.selectedRecipes.map((s) => [s.recipeId, s.servings]));
    const versLines: string[] = [];
    const voorraadLines: string[] = [];

    for (const r of recipes) {
      const targetServings = selectedMap.get(r.id);
      if (!targetServings) continue;
      for (const ing of r.ingredients) {
        const line = `• ${[ing.amount, ing.unit, ing.name].filter(Boolean).join(' ')}`;
        if (ing.storageCategory === 'vers' || ing.storageCategory === 'bakkerij') {
          versLines.push(line);
        } else {
          voorraadLines.push(line);
        }
      }
    }
    for (const m of shoppingState.manualItems) {
      const line = `• ${[m.amount, m.unit, m.name].filter(Boolean).join(' ')}`;
      if (m.storageCategory === 'vers' || m.storageCategory === 'bakkerij') {
        versLines.push(line);
      } else {
        voorraadLines.push(line);
      }
    }

    return [
      `Boodschappenlijst — ${profile.cookbookTitle}`,
      '',
      'VERS TE KOPEN:',
      ...(versLines.length > 0 ? versLines : ['(geen verse items geselecteerd)']),
      '',
      'IN DE VOORRAAD (CHECKEN):',
      ...(voorraadLines.length > 0 ? voorraadLines : ['(geen voorraaditems)']),
    ].join('\n');
  };

  const handleCopyShoppingText = async () => {
    const summary = buildShoppingSummaryText();
    try {
      await navigator.clipboard.writeText(summary);
      setCopiedShopping(true);
      window.setTimeout(() => setCopiedShopping(false), 2200);
    } catch {
      // Clipboard blocked
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMemberError('');
    const cleanEmail = memberEmail.trim().toLowerCase();
    const cleanName = memberName.trim();
    if (!cleanName) {
      setMemberError('Vul een naam in.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setMemberError('Vul een geldig e-mailadres in.');
      return;
    }
    setMemberBusy(true);
    try {
      await onAddFamilyMember({
        memberName: cleanName,
        memberEmail: cleanEmail,
        role: memberRole,
        canViewShoppingList: memberCanShop,
        note: memberNote.trim(),
      });
      setMemberName('');
      setMemberEmail('');
      setMemberNote('');
    } finally {
      setMemberBusy(false);
    }
  };

  const handleSaveIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveProfile({
      ...profile,
      displayName: profileAuthor.trim() || 'Familie',
      cookbookTitle: profileTitle.trim() || 'Ons Familiekookboek',
      cookbookSubtitle: profileSubtitle.trim(),
      familyName: profileFamily.trim() || 'Familie-editie',
    });
    setProfileSaved(true);
    window.setTimeout(() => setProfileSaved(false), 2000);
  };

  const handleCreateAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    const uid = adminUidInput.trim();
    const email = adminEmailInput.trim().toLowerCase();
    const name = adminNameInput.trim();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) {
      setAdminError('Vul een geldige Firebase UID in (alleen letters, cijfers, _ of -).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAdminError('Vul een geldig e-mailadres in.');
      return;
    }
    if (!name) {
      setAdminError('Vul een weergavenaam in.');
      return;
    }
    setAdminBusy(true);
    try {
      await onAddAdminRecord({ uid, email, displayName: name });
      setAdminUidInput('');
      setAdminEmailInput('');
      setAdminNameInput('');
    } finally {
      setAdminBusy(false);
    }
  };

  const handleBackupFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMessage('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<FullBackupPayload>;
      if (!parsed || !Array.isArray(parsed.recipes)) {
        setImportMessage('Ongeldig back-upbestand: geen receptenlijst gevonden.');
        return;
      }
      const importedCount = await onImportBackup({
        exportedAt: parsed.exportedAt || new Date().toISOString(),
        version: parsed.version || 1,
        profile: parsed.profile || profile,
        recipes: parsed.recipes,
        recurringItems: Array.isArray(parsed.recurringItems) ? parsed.recurringItems : [],
      });
      setImportMessage(`${importedCount} recept(en) succesvol geïmporteerd.`);
    } catch {
      setImportMessage('Kon het JSON-bestand niet lezen.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-8">
      {/* Header & Account Summary */}
      <section className="bg-white border border-zinc-200 rounded-2xl p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium text-[#14532D]">
            <ShieldCheck className="w-4 h-4" />
            <span>
              {isBootstrappedAdmin
                ? 'Hoofdbeheerder (Admin)'
                : isAdmin
                  ? 'Beheerder (Admin)'
                  : isSignedIn
                    ? 'Eigenaar van jouw familiekookboek'
                    : 'Lokale voorbeeldmodus'}
            </span>
          </div>
          <h1 className="font-editorial text-3xl font-semibold tracking-tight text-zinc-950">
            Beheer, Delen &amp; Publiceren
          </h1>
          <p className="text-sm text-zinc-600 max-w-2xl">
            Nodig familieleden uit, maak alleen-lezen deellinks voor je kookboek, beheer rechten en
            notities of publiceer Aan Tafel! gratis op GitHub Pages.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <PWAInstallButton variant="panel" />
          {isSignedIn ? (
            <div className="flex items-center gap-3 px-3.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl">
              <div className="text-xs">
                <p className="font-medium text-zinc-900">{userDisplayName || 'Gebruiker'}</p>
                <p className="text-zinc-500">{userEmail}</p>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-100 rounded-lg cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Uitloggen
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              Inloggen met Google
            </button>
          )}
        </div>
      </section>

      {/* Sub-navigation */}
      <div className="flex items-center gap-2 border-b border-zinc-200 pb-3 overflow-x-auto">
        <button
          type="button"
          onClick={() => setSubTab('delen')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
            subTab === 'delen'
              ? 'bg-zinc-900 text-white'
              : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
          }`}
        >
          <Share2 className="w-3.5 h-3.5" />
          Delen &amp; Familie ({familyMembers.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('admin')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
            subTab === 'admin'
              ? 'bg-zinc-900 text-white'
              : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          Admin &amp; Moderatie
        </button>
        <button
          type="button"
          onClick={() => setSubTab('publiceren')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
            subTab === 'publiceren'
              ? 'bg-zinc-900 text-white'
              : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          Gratis publiceren (GitHub Pages)
        </button>
      </div>

      {/* ===================================================================== */}
      {/* SUBTAB 1: SHARE & FAMILY                                              */}
      {/* ===================================================================== */}
      {subTab === 'delen' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
          {/* Left 7 cols: Cookbook Share Links */}
          <div className="lg:col-span-7 space-y-6">
            <section className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-editorial text-xl font-semibold text-zinc-950">
                    Kookboek-deellinks (alleen-lezen)
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Deel een beveiligde link zonder privé-e-mails of boodschappenlijst. Familie kan
                    recepten lezen en als PDF afdrukken.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={shareBusy || recipes.length === 0}
                  onClick={async () => {
                    setShareError('');
                    setShareBusy(true);
                    try {
                      await onCreateOrSyncShareLink({
                        recipeIds: recipes.slice(0, 30).map((r) => r.id),
                        allowCopy: shareAllowCopy,
                        isActive: true,
                      });
                    } catch {
                      setShareError('De deellink kon niet worden opgeslagen. Probeer opnieuw.');
                    } finally {
                      setShareBusy(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  {shareBusy ? 'Publiceren...' : 'Nieuwe deellink'}
                </button>
              </div>

              {!isSignedIn && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Log eerst in met Google om een echte cloud-deellink aan te maken die familie op
                    hun eigen toestel via WhatsApp of e-mail kan openen.
                  </span>
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="px-3 py-1.5 font-medium bg-white border border-amber-300 text-amber-950 hover:bg-amber-100 rounded-lg cursor-pointer"
                  >
                    Inloggen met Google
                  </button>
                </div>
              )}

              {recipes.length === 0 && (
                <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-700 space-y-2.5">
                  <p>
                    <strong>Waarom is de knop uitgeschakeld?</strong> Je kookboek bevat nog{' '}
                    <strong>0 recepten</strong>. Voeg eerst een recept toe of laad de 4
                    voorbeeldrecepten om een deellink te kunnen maken.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {isSignedIn && onSeedRecipes && (
                      <button
                        type="button"
                        disabled={seedingRecipes}
                        onClick={() => void onSeedRecipes()}
                        className="px-3 py-1.5 font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg disabled:opacity-50 cursor-pointer"
                      >
                        {seedingRecipes ? 'Laden...' : 'Laad 4 voorbeeldrecepten'}
                      </button>
                    )}
                    {onCreateNewRecipe && (
                      <button
                        type="button"
                        onClick={onCreateNewRecipe}
                        className="px-3 py-1.5 font-medium text-zinc-800 bg-white border border-zinc-200 hover:bg-zinc-100 rounded-lg cursor-pointer"
                      >
                        Schrijf eerste recept
                      </button>
                    )}
                  </div>
                </div>
              )}

              {shareError && <p className="text-xs text-red-700">{shareError}</p>}

              <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareAllowCopy}
                  onChange={(e) => setShareAllowCopy(e.target.checked)}
                  className="rounded border-zinc-300 text-[#14532D] focus:ring-[#14532D]"
                />
                Ontvangers toestaan recepten naar hun eigen Aan Tafel! kookboek te kopiëren
              </label>

              {sharedCookbooks.length === 0 ? (
                <div className="p-5 bg-zinc-50 border border-dashed border-zinc-200 rounded-xl text-xs text-zinc-600">
                  Nog geen actieve deellink aangemaakt. Klik op{' '}
                  <strong>Nieuwe deellink</strong> om een deelbare link voor je {recipes.length}{' '}
                  recepten te genereren. Daarna kun je hem met één klik versturen via WhatsApp of
                  e-mail.
                </div>
              ) : (
                <div className="space-y-3">
                  {sharedCookbooks.map((share) => {
                    const shareUrl = buildShareUrl(share.shareCode);
                    const shareText = `Bekijk ons familiekookboek "${share.cookbookTitle}" (${share.recipeCount} recepten):\n${shareUrl}`;
                    const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
                    const emailHref = `mailto:?subject=${encodeURIComponent(
                      `Familiekookboek: ${share.cookbookTitle}`
                    )}&body=${encodeURIComponent(shareText)}`;

                    return (
                      <div
                        key={share.shareCode}
                        className="p-4 border border-zinc-200 rounded-xl bg-zinc-50/60 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-zinc-950">
                              {share.cookbookTitle}
                            </p>
                            <p className="text-xs text-zinc-500 tabular-nums">
                              {share.recipeCount} recepten ·{' '}
                              {share.isActive ? 'Actief' : 'Gepauzeerd'} ·{' '}
                              {share.allowCopy ? 'Kopiëren toegestaan' : 'Alleen lezen'}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <a
                              href={whatsappHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              WhatsApp
                            </a>
                            <a
                              href={emailHref}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-zinc-800 bg-white border border-zinc-200 hover:bg-zinc-100 rounded-lg"
                            >
                              <Mail className="w-3.5 h-3.5" />
                              E-mail
                            </a>
                            <button
                              type="button"
                              onClick={() => void handleCopyShareUrl(share.shareCode)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-zinc-800 bg-white border border-zinc-200 hover:bg-zinc-100 rounded-lg cursor-pointer"
                            >
                              {copiedCode === share.shareCode ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-[#14532D]" />
                                  Gekopieerd
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  Kopieer
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => onPreviewShareLink(share)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-100 rounded-lg cursor-pointer"
                              title="Bekijk als bezoeker"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Open
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void onCreateOrSyncShareLink({
                                  existingShare: share,
                                  recipeIds: recipes.slice(0, 30).map((r) => r.id),
                                  allowCopy: share.allowCopy,
                                  isActive: share.isActive,
                                })
                              }
                              className="p-1.5 text-zinc-600 hover:text-zinc-950 bg-white border border-zinc-200 rounded-lg cursor-pointer"
                              title="Synchroniseer nieuwste recepten"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void onToggleShareActive(share)}
                              className="px-2.5 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-100 rounded-lg cursor-pointer"
                            >
                              {share.isActive ? 'Pauzeer' : 'Activeer'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void onDeleteShareLink(share.shareCode)}
                              className="p-1.5 text-zinc-400 hover:text-red-700 cursor-pointer"
                              title="Verwijder deellink"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="px-3 py-1.5 bg-white border border-zinc-200 rounded-lg font-mono text-[11px] text-zinc-600 truncate">
                          {shareUrl}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Quick WhatsApp / E-mail / Text Shopping List Share */}
            <section className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-4">
              <div className="space-y-1">
                <h2 className="font-editorial text-lg font-semibold text-zinc-950">
                  Boodschappenlijst direct doorsturen
                </h2>
                <p className="text-xs text-zinc-500">
                  Verstuur je actieve lijst ({shoppingState.selectedRecipes.length} gerechten +{' '}
                  {shoppingState.manualItems.length} losse items), opgesplitst in Vers en Voorraad,
                  rechtstreeks via WhatsApp of e-mail.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(buildShoppingSummaryText())}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg whitespace-nowrap"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Deel via WhatsApp
                </a>
                <a
                  href={`mailto:?subject=${encodeURIComponent(
                    `Boodschappenlijst — ${profile.cookbookTitle}`
                  )}&body=${encodeURIComponent(buildShoppingSummaryText())}`}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-800 bg-zinc-100 hover:bg-zinc-200 rounded-lg whitespace-nowrap"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Deel via e-mail
                </a>
                <button
                  type="button"
                  onClick={() => void handleCopyShoppingText()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-800 bg-zinc-100 hover:bg-zinc-200 rounded-lg whitespace-nowrap cursor-pointer"
                >
                  {copiedShopping ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#14532D]" />
                      Gekopieerd
                    </>
                  ) : (
                    <>
                      <ClipboardList className="w-3.5 h-3.5" />
                      Kopieer tekst
                    </>
                  )}
                </button>
              </div>
            </section>
          </div>

          {/* Right 5 cols: Family Members & Roles */}
          <div className="lg:col-span-5 space-y-6">
            <section className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-5">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#14532D]" />
                <h2 className="font-editorial text-xl font-semibold text-zinc-950">
                  Familieleden &amp; Rollen
                </h2>
              </div>

              <form onSubmit={handleInviteSubmit} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    placeholder="Naam (bijv. Oma Greet)"
                    maxLength={100}
                    className="px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                  />
                  <input
                    type="email"
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    placeholder="E-mailadres"
                    maxLength={160}
                    className="px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <select
                    value={memberRole}
                    onChange={(e) => setMemberRole(e.target.value as FamilyRole)}
                    className="px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                  >
                    <option value="editor">Medewerker (recepten &amp; notities)</option>
                    <option value="viewer">Lezer (alleen bekijken)</option>
                    <option value="admin">Beheerder (admin-rechten)</option>
                  </select>
                  <input
                    type="text"
                    value={memberNote}
                    onChange={(e) => setMemberNote(e.target.value)}
                    placeholder="Notitie (optioneel)"
                    maxLength={240}
                    className="px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <label className="flex items-center gap-2 text-xs text-zinc-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={memberCanShop}
                      onChange={(e) => setMemberCanShop(e.target.checked)}
                      className="rounded border-zinc-300 text-[#14532D]"
                    />
                    Boodschappenlijst delen
                  </label>
                  <button
                    type="submit"
                    disabled={memberBusy}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg disabled:opacity-50 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Toevoegen
                  </button>
                </div>

                {memberError && <p className="text-xs text-red-700">{memberError}</p>}
              </form>

              <div className="divide-y divide-zinc-100 border-t border-zinc-200 pt-2">
                {familyMembers.length === 0 ? (
                  <p className="py-4 text-xs text-zinc-500">
                    Nog geen familieleden geregistreerd. Voeg hierboven familieleden toe om hun
                    rollen en rechten bij te houden.
                  </p>
                ) : (
                  familyMembers.map((m) => {
                    const isRevokedLocked = m.status === 'revoked' && !isAdmin;
                    return (
                      <div
                        key={m.id}
                        className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-900 truncate">
                            {m.memberName}{' '}
                            <span className="text-xs font-normal text-zinc-500">
                              · {STATUS_LABELS[m.status]}
                            </span>
                          </p>
                          <p className="text-xs text-zinc-500 truncate">{m.memberEmail}</p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <select
                            aria-label={`Rol voor ${m.memberName}`}
                            value={m.role}
                            disabled={isRevokedLocked}
                            onChange={(e) =>
                              void onUpdateFamilyMember(m, { role: e.target.value as FamilyRole })
                            }
                            className="px-2 py-1 text-xs bg-zinc-100 border border-zinc-200 rounded-md disabled:opacity-50"
                          >
                            <option value="admin">{ROLE_LABELS.admin}</option>
                            <option value="editor">{ROLE_LABELS.editor}</option>
                            <option value="viewer">{ROLE_LABELS.viewer}</option>
                          </select>

                          <button
                            type="button"
                            disabled={isRevokedLocked}
                            onClick={() =>
                              void onUpdateFamilyMember(m, {
                                status: m.status === 'active' ? 'revoked' : 'active',
                              })
                            }
                            className="px-2 py-1 text-xs text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-md disabled:opacity-40 cursor-pointer"
                          >
                            {m.status === 'active' ? 'Trek in' : 'Activeer'}
                          </button>

                          <button
                            type="button"
                            onClick={() => void onDeleteFamilyMember(m.id)}
                            className="p-1 text-zinc-400 hover:text-red-700 cursor-pointer"
                            title="Verwijder familielid"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUBTAB 2: ADMIN & MODERATION                                          */}
      {/* ===================================================================== */}
      {subTab === 'admin' && (
        <div className="space-y-7">
          {/* Row 1: Identity Settings & JSON Backup */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
            <form
              onSubmit={handleSaveIdentity}
              className="lg:col-span-7 bg-white border border-zinc-200 rounded-2xl p-6 space-y-4"
            >
              <h2 className="font-editorial text-xl font-semibold text-zinc-950">
                Kookboek-identiteit &amp; Standaardgegevens
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">
                    Titel kookboek
                  </label>
                  <input
                    type="text"
                    value={profileTitle}
                    onChange={(e) => setProfileTitle(e.target.value)}
                    maxLength={120}
                    className="w-full px-3 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">
                    Familienaam / Editie
                  </label>
                  <input
                    type="text"
                    value={profileFamily}
                    onChange={(e) => setProfileFamily(e.target.value)}
                    maxLength={100}
                    className="w-full px-3 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">
                    Ondertitel
                  </label>
                  <input
                    type="text"
                    value={profileSubtitle}
                    onChange={(e) => setProfileSubtitle(e.target.value)}
                    maxLength={200}
                    className="w-full px-3 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">
                    Standaard auteursnaam
                  </label>
                  <input
                    type="text"
                    value={profileAuthor}
                    onChange={(e) => setProfileAuthor(e.target.value)}
                    maxLength={100}
                    className="w-full px-3 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-zinc-500">
                  {userUid ? `Jouw Firebase UID: ${userUid}` : 'Niet ingelogd (lokale sessie)'}
                </span>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg cursor-pointer"
                >
                  {profileSaved ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Opgeslagen
                    </>
                  ) : (
                    'Instellingen opslaan'
                  )}
                </button>
              </div>
            </form>

            {/* Backup & Restore */}
            <section className="lg:col-span-5 bg-white border border-zinc-200 rounded-2xl p-6 flex flex-col justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FolderArchive className="w-4 h-4 text-[#14532D]" />
                  <h2 className="font-editorial text-xl font-semibold text-zinc-950">
                    Back-up &amp; Herstel (JSON)
                  </h2>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Maak een volledige reservekopie van je {recipes.length} recepten,{' '}
                  {recurringItems.length} terugkerende boodschappen en {memoryEntries.length}{' '}
                  Vers/Voorraad-voorkeuren, of zet een eerdere JSON-back-up terug.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => downloadJsonBackup(profile, recipes, recurringItems)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download JSON back-up
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-zinc-800 bg-zinc-100 hover:bg-zinc-200 rounded-lg cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Importeer JSON
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={handleBackupFileChange}
                    className="hidden"
                  />
                </div>
                {importMessage && (
                  <p className="text-xs font-medium text-[#14532D]">{importMessage}</p>
                )}
              </div>
            </section>
          </div>

          {/* Row 2: Recipe Admin Table & Comment Moderation */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
            <section className="lg:col-span-7 bg-white border border-zinc-200 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-editorial text-xl font-semibold text-zinc-950">
                  Receptenbeheer ({recipes.length})
                </h2>
                <span className="text-xs text-zinc-500">Snel bewerken of opschonen</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 text-zinc-500">
                      <th className="py-2 pr-3 font-medium">Gerecht</th>
                      <th className="py-2 pr-3 font-medium">Hoofdstuk</th>
                      <th className="py-2 pr-3 font-medium">Auteur</th>
                      <th className="py-2 text-right font-medium">Actie</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {recipes.map((r) => (
                      <tr key={r.id} className="hover:bg-zinc-50/70">
                        <td className="py-2.5 pr-3 font-medium text-zinc-900 max-w-[200px] truncate">
                          {r.title}
                        </td>
                        <td className="py-2.5 pr-3 text-zinc-600 whitespace-nowrap">
                          {r.category}
                        </td>
                        <td className="py-2.5 pr-3 text-zinc-600 whitespace-nowrap">
                          {r.authorName}
                        </td>
                        <td className="py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onEditRecipe(r)}
                              className="p-1 text-zinc-500 hover:text-zinc-950 cursor-pointer"
                              title="Bewerk recept"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {confirmDeleteRecipeId === r.id ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  await onDeleteRecipe(r.id);
                                  setConfirmDeleteRecipeId(null);
                                }}
                                className="px-2 py-0.5 text-[11px] font-medium text-white bg-red-700 hover:bg-red-800 rounded cursor-pointer"
                              >
                                Bevestig
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteRecipeId(r.id)}
                                className="p-1 text-zinc-400 hover:text-red-700 cursor-pointer"
                                title="Verwijder recept"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Comments Moderation + Memory */}
            <div className="lg:col-span-5 space-y-6">
              <section className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-4">
                <h2 className="font-editorial text-xl font-semibold text-zinc-950">
                  Familienotities modereren ({allComments.length})
                </h2>
                {allComments.length === 0 ? (
                  <p className="text-xs text-zinc-500">Geen familienotities aanwezig.</p>
                ) : (
                  <div className="divide-y divide-zinc-100 max-h-60 overflow-y-auto pr-1">
                    {allComments.map((c) => (
                      <div key={c.id} className="py-2.5 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-zinc-900">
                            {c.authorName}{' '}
                            <span className="font-normal text-zinc-500">op {c.recipeTitle}</span>
                          </p>
                          <p className="text-xs text-zinc-600 line-clamp-2 mt-0.5">{c.text}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void onDeleteComment(c.recipeId, c.id)}
                          className="p-1 text-zinc-400 hover:text-red-700 shrink-0 cursor-pointer"
                          title="Verwijder notitie"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-4">
                <h2 className="font-editorial text-xl font-semibold text-zinc-950">
                  Vers / Voorraad-geheugen ({memoryEntries.length})
                </h2>
                {memoryEntries.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    Nog geen eigen voorkeuren opgeslagen. Zodra je bij een recept of boodschappenlijst
                    een ingrediënt op Vers of Voorraad zet, verschijnt het hier.
                  </p>
                ) : (
                  <div className="divide-y divide-zinc-100 max-h-56 overflow-y-auto pr-1">
                    {memoryEntries.map(([key, cat]) => (
                      <div key={key} className="py-2 flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-zinc-800 capitalize truncate">{key}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              void onFlipIngredientMemory(
                                key,
                                cat === 'vers' ? 'proviandkast' : 'vers'
                              )
                            }
                            className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                              cat === 'vers'
                                ? 'bg-emerald-50 text-[#14532D]'
                                : 'bg-amber-50 text-[#92400E]'
                            }`}
                          >
                            {cat === 'vers' ? 'Vers' : 'Voorraad'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void onRemoveIngredientMemory(key)}
                            className="p-1 text-zinc-400 hover:text-red-700 cursor-pointer"
                            title="Vergeet voorkeur"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>

          {/* Row 3: RBAC Admin Registry (only shown when verified admin) */}
          {isAdmin && (
            <section className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-editorial text-xl font-semibold text-zinc-950">
                    Beheerdersregister (RBAC Admin-rollen)
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Hoofdbeheerder (<span className="font-mono">adamske@gmail.com</span>) is altijd
                    beveiligd actief. Voeg hier extra Firebase UID&apos;s toe als mede-beheerder.
                  </p>
                </div>
              </div>

              <form
                onSubmit={handleCreateAdminSubmit}
                className="grid grid-cols-1 md:grid-cols-4 gap-2.5"
              >
                <input
                  type="text"
                  value={adminUidInput}
                  onChange={(e) => setAdminUidInput(e.target.value)}
                  placeholder="Firebase UID"
                  className="px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                />
                <input
                  type="text"
                  value={adminNameInput}
                  onChange={(e) => setAdminNameInput(e.target.value)}
                  placeholder="Naam beheerder"
                  className="px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                />
                <input
                  type="email"
                  value={adminEmailInput}
                  onChange={(e) => setAdminEmailInput(e.target.value)}
                  placeholder="E-mailadres"
                  className="px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                />
                <button
                  type="submit"
                  disabled={adminBusy}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Admin toekennen
                </button>
              </form>
              {adminError && <p className="text-xs text-red-700">{adminError}</p>}

              {adminRecords.length > 0 && (
                <div className="divide-y divide-zinc-100 border-t border-zinc-200 pt-2">
                  {adminRecords.map((adm) => (
                    <div
                      key={adm.uid}
                      className="py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <p className="font-medium text-zinc-900">
                          {adm.displayName}{' '}
                          <span className="font-mono text-zinc-500">({adm.uid})</span>
                        </p>
                        <p className="text-zinc-500">{adm.email}</p>
                      </div>
                      {adm.uid !== userUid && (
                        <button
                          type="button"
                          onClick={() => void onRemoveAdminRecord(adm.uid)}
                          className="px-2.5 py-1 text-xs text-red-700 bg-red-50 hover:bg-red-100 rounded-md cursor-pointer"
                        >
                          Intrekken
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUBTAB 3: FREE GITHUB PAGES PUBLISHING & PWA BUNDLE                   */}
      {/* ===================================================================== */}
      {subTab === 'publiceren' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
          {/* Route A: User's familiar 3-file standalone GitHub Pages workflow */}
          <section className="lg:col-span-6 bg-white border border-zinc-200 rounded-2xl p-6 sm:p-7 space-y-5">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-[#14532D]">
                Route 1 · Jouw vertrouwde 3-bestanden methode (100% gratis)
              </p>
              <h2 className="font-editorial text-2xl font-semibold text-zinc-950">
                Standalone index.html + manifest.json + sw.js
              </h2>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Download hieronder 3 kant-en-klare bestanden met al je huidige recepten ({recipes.length})
                en foto&apos;s ingebakken. Geen build-stap en geen eigen webserver nodig. (Let op: de
                browser-standaard voor Service Worker heet <code className="font-mono">sw.js</code>{' '}
                in plaats van <code className="font-mono">ws.js</code>.)
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={exportingHtml}
                onClick={async () => {
                  setExportingHtml(true);
                  try {
                    await downloadStandaloneIndexHtml(recipes, profile);
                  } finally {
                    setExportingHtml(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg disabled:opacity-50 cursor-pointer"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                {exportingHtml ? 'Genereren...' : '1. Download index.html'}
              </button>
              <button
                type="button"
                onClick={() => downloadManifestJson(profile)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-800 bg-zinc-100 hover:bg-zinc-200 rounded-lg cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                2. Download manifest.json
              </button>
              <button
                type="button"
                onClick={() => downloadServiceWorkerJs()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-800 bg-zinc-100 hover:bg-zinc-200 rounded-lg cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                3. Download sw.js
              </button>
            </div>

            <ol className="text-xs text-zinc-700 space-y-2 list-decimal list-inside border-t border-zinc-100 pt-4 leading-relaxed">
              <li>
                Maak op <strong>github.com</strong> een nieuwe openbare repository aan (bijv.{' '}
                <code className="font-mono">familiekookboek</code>).
              </li>
              <li>
                Upload de 3 gedownloade bestanden (<code className="font-mono">index.html</code>,{' '}
                <code className="font-mono">manifest.json</code>,{' '}
                <code className="font-mono">sw.js</code>) rechtstreeks in de hoofdmap.
              </li>
              <li>
                Ga naar <strong>Settings → Pages</strong>, kies <strong>Deploy from a branch</strong>{' '}
                → branch <code className="font-mono">main</code> → map{' '}
                <code className="font-mono">/ (root)</code> en klik op <strong>Save</strong>.
              </li>
              <li>
                Na 1 minuut staat je familiekookboek gratis live op{' '}
                <code className="font-mono">https://jouw-naam.github.io/familiekookboek/</code> en
                is installeerbaar op GSM!
              </li>
            </ol>
          </section>

          {/* Route B: Full interactive React + Firebase app via free GitHub Actions */}
          <section className="lg:col-span-6 bg-white border border-zinc-200 rounded-2xl p-6 sm:p-7 space-y-5">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-zinc-500">
                Route 2 · Volledige app met Firebase cloud-sync, PDF-studio &amp; Delen (ook 100%
                gratis)
              </p>
              <h2 className="font-editorial text-2xl font-semibold text-zinc-950">
                Automatisch bouwen met GitHub Pages + Actions
              </h2>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Omdat de volledige Aan Tafel!-app met React, Vite en Firebase werkt, kan GitHub hem
                gratis voor je compileren naar een statische PWA (inclusief automatische{' '}
                <code className="font-mono">manifest.webmanifest</code> en{' '}
                <code className="font-mono">sw.js</code>).
              </p>
            </div>

            <div>
              <button
                type="button"
                onClick={() => downloadGithubActionsWorkflow()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download .github/workflows/deploy.yml
              </button>
            </div>

            <ol className="text-xs text-zinc-700 space-y-2 list-decimal list-inside border-t border-zinc-100 pt-4 leading-relaxed">
              <li>
                Exporteer/download dit project vanuit AI Studio en zet het in je GitHub-repository.
              </li>
              <li>
                Plaats het gedownloade bestand op het pad{' '}
                <code className="font-mono">.github/workflows/deploy.yml</code>.
              </li>
              <li>
                Ga in GitHub naar <strong>Settings → Pages</strong> en zet <strong>Source</strong> op{' '}
                <strong>GitHub Actions</strong>. Bij elke push bouwt GitHub gratis jouw hele app.
              </li>
              <li>
                <strong>Belangrijk voor Google-login:</strong> open de Firebase Console →{' '}
                <strong>Authentication → Settings → Authorized domains</strong> en voeg{' '}
                <code className="font-mono">jouw-gebruikersnaam.github.io</code> toe.
              </li>
            </ol>
          </section>
        </div>
      )}
    </div>
  );
};
