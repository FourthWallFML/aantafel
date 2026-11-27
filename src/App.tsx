import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  BookOpen,
  Check,
  Cloud,
  FileDown,
  Plus,
  Search,
  ShoppingBasket,
  Video,
} from 'lucide-react';
import { AdminShareView } from './components/AdminShareView';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { PdfCookbookStudio } from './components/PdfCookbookStudio';
import { RecipeDetailModal } from './components/RecipeDetailModal';
import { RecipeEditorModal, RecipeFormData } from './components/RecipeEditorModal';
import { RecipeImage } from './components/RecipeImage';
import { SeasonTrackerView } from './components/SeasonTrackerView';
import { SharedCookbookView } from './components/SharedCookbookView';
import { ShoppingListView } from './components/ShoppingListView';
import {
  HERO_TABLE_IMAGE,
  createStarterComments,
  createStarterRecipes,
} from './data/starterRecipes';
import { createStarterRecurringItems } from './data/starterRecurring';
import { OperationType, auth, db, googleProvider, handleFirestoreError } from './firebase';
import {
  ActiveTab,
  AdminRecord,
  FamilyMember,
  FamilyMemberStatus,
  FamilyRole,
  RECIPE_CATEGORIES,
  Recipe,
  RecipeCategory,
  RecipeComment,
  RecurringItem,
  SharedCookbook,
  SharedRecipeSnapshot,
  ShoppingListState,
  StorageCategory,
  UserProfile,
} from './types';
import { FullBackupPayload } from './utils/githubPagesExport';
import {
  computeAverageIntervalDays,
  normalizeIngredientKey,
} from './utils/ingredientCategorizer';

const BOOTSTRAPPED_ADMIN_EMAIL = 'adamske@gmail.com';

const DEFAULT_PROFILE: UserProfile = {
  displayName: 'Familie',
  cookbookTitle: 'Ons Familiekookboek',
  cookbookSubtitle: 'Verzameld aan de keukentafel — recepten om door te geven',
  familyName: 'Familie-editie',
  ingredientMemory: {},
};

function createEmptyShoppingList(ownerId: string): ShoppingListState {
  return {
    id: ownerId,
    ownerId,
    title: 'Weekboodschappen',
    selectedRecipes:
      ownerId === 'local'
        ? [
            { recipeId: 'starter_stoofvlees', servings: 4 },
            { recipeId: 'starter_pompoensoep', servings: 4 },
          ]
        : [],
    checkedKeys: [],
    manualItems: [],
    categoryOverrides: {},
  };
}

function timestampToMs(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number') return val;
  if (val && typeof val === 'object' && 'seconds' in val) {
    const sec = (val as { seconds: number }).seconds;
    return sec * 1000;
  }
  return Date.now();
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('kookboek');

  // Local guest fallback state (works seamlessly before sign-in)
  const [localRecipes, setLocalRecipes] = useState<Recipe[]>(() => createStarterRecipes('local'));
  const [localComments, setLocalComments] = useState<Record<string, RecipeComment[]>>(() =>
    createStarterComments('local')
  );
  const [localShopping, setLocalShopping] = useState<ShoppingListState>(() =>
    createEmptyShoppingList('local')
  );
  const [localRecurring, setLocalRecurring] = useState<RecurringItem[]>(() =>
    createStarterRecurringItems('local')
  );
  const [localProfile, setLocalProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [localFamilyMembers, setLocalFamilyMembers] = useState<FamilyMember[]>([]);
  const [localSharedCookbooks, setLocalSharedCookbooks] = useState<SharedCookbook[]>([]);

  // Cloud Firestore state (active when authenticated)
  const [cloudRecipes, setCloudRecipes] = useState<Recipe[]>([]);
  const [cloudComments, setCloudComments] = useState<Record<string, RecipeComment[]>>({});
  const [cloudShopping, setCloudShopping] = useState<ShoppingListState | null>(null);
  const [cloudRecurring, setCloudRecurring] = useState<RecurringItem[]>([]);
  const [cloudProfile, setCloudProfile] = useState<UserProfile | null>(null);
  const [cloudFamilyMembers, setCloudFamilyMembers] = useState<FamilyMember[]>([]);
  const [cloudSharedCookbooks, setCloudSharedCookbooks] = useState<SharedCookbook[]>([]);
  const [cloudAdminRecords, setCloudAdminRecords] = useState<AdminRecord[]>([]);
  const [isListedAdmin, setIsListedAdmin] = useState(false);
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [seedingCloud, setSeedingCloud] = useState(false);

  // Public/Preview Shared Cookbook (?share=...)
  const [viewingSharedCookbook, setViewingSharedCookbook] = useState<SharedCookbook | null>(null);
  const [sharedLookupLoading, setSharedLookupLoading] = useState(false);
  const [sharedLookupError, setSharedLookupError] = useState('');

  // UI Filters & Modals
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'Alle' | RecipeCategory>('Alle');
  const [detailRecipeId, setDetailRecipeId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);

  const shoppingSyncTimerRef = useRef<number | null>(null);

  const isBootstrappedAdmin = Boolean(
    user && user.emailVerified && user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL
  );
  const isAdmin = isBootstrappedAdmin || isListedAdmin;

  // 0. Check ?share=<code> URL query on initial load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareCode = params.get('share')?.trim();
    if (!shareCode || !/^[a-zA-Z0-9_-]{8,64}$/.test(shareCode)) return;

    setSharedLookupLoading(true);
    setSharedLookupError('');
    void getDoc(doc(db, 'sharedCookbooks', shareCode))
      .then((snap) => {
        if (!snap.exists()) {
          setSharedLookupError('Deze deellink bestaat niet of is ingetrokken.');
          return;
        }
        const d = snap.data();
        setViewingSharedCookbook({
          id: snap.id,
          ownerId: String(d.ownerId || ''),
          shareCode: String(d.shareCode || snap.id),
          cookbookTitle: String(d.cookbookTitle || 'Gedeeld Kookboek'),
          cookbookSubtitle: String(d.cookbookSubtitle || ''),
          familyName: String(d.familyName || 'Familie-editie'),
          sharedByName: String(d.sharedByName || 'Familielid'),
          isActive: Boolean(d.isActive),
          allowCopy: Boolean(d.allowCopy),
          recipeCount: Number(d.recipeCount) || 0,
          recipesSnapshot: Array.isArray(d.recipesSnapshot)
            ? (d.recipesSnapshot as SharedRecipeSnapshot[])
            : [],
          createdAtMs: timestampToMs(d.createdAt),
          updatedAtMs: timestampToMs(d.updatedAt),
        });
      })
      .catch(() => {
        setSharedLookupError('Deze deellink is niet langer actief of kon niet worden geladen.');
      })
      .finally(() => setSharedLookupLoading(false));
  }, []);

  // 1. Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setCloudRecipes([]);
        setCloudComments({});
        setCloudShopping(null);
        setCloudRecurring([]);
        setCloudProfile(null);
        setCloudFamilyMembers([]);
        setCloudSharedCookbooks([]);
        setCloudAdminRecords([]);
        setIsListedAdmin(false);
        setCloudLoaded(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Cloud Firestore Listeners (strictly gated on authReady && user)
  useEffect(() => {
    if (!authReady || !user) return;

    const uid = user.uid;
    let recipesLoadedOnce = false;

    // Profile + Ingredient Memory listener
    const profileRef = doc(db, 'users', uid);
    const unsubProfile = onSnapshot(
      profileRef,
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setCloudProfile({
            displayName: String(d.displayName || user.displayName || 'Familie'),
            cookbookTitle: String(d.cookbookTitle || DEFAULT_PROFILE.cookbookTitle),
            cookbookSubtitle: String(d.cookbookSubtitle || DEFAULT_PROFILE.cookbookSubtitle),
            familyName: String(d.familyName || DEFAULT_PROFILE.familyName),
            ingredientMemory:
              d.ingredientMemory && typeof d.ingredientMemory === 'object'
                ? (d.ingredientMemory as Record<string, StorageCategory>)
                : {},
          });
        } else {
          setCloudProfile({
            ...DEFAULT_PROFILE,
            displayName: (user.displayName || 'Familie').slice(0, 100),
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`)
    );

    // Recipes listener
    const recipesQuery = query(collection(db, 'recipes'), where('ownerId', '==', uid));
    const unsubRecipes = onSnapshot(
      recipesQuery,
      (snap) => {
        const list: Recipe[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ownerId: String(data.ownerId || uid),
              title: String(data.title || ''),
              subtitle: String(data.subtitle || ''),
              story: String(data.story || ''),
              category: (data.category as RecipeCategory) || 'Hoofdgerecht',
              prepMinutes: Number(data.prepMinutes) || 0,
              cookMinutes: Number(data.cookMinutes) || 0,
              servings: Number(data.servings) || 4,
              authorName: String(data.authorName || 'Familielid'),
              coverImage: String(data.coverImage || ''),
              extraImages: Array.isArray(data.extraImages) ? data.extraImages.map(String) : [],
              videoUrl: String(data.videoUrl || ''),
              videoTitle: String(data.videoTitle || ''),
              videoLocalId: String(data.videoLocalId || ''),
              ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
              steps: Array.isArray(data.steps) ? data.steps.map(String) : [],
              notes: String(data.notes || ''),
              createdAtMs: timestampToMs(data.createdAt),
              updatedAtMs: timestampToMs(data.updatedAt),
            };
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs);

        setCloudRecipes(list);
        if (!recipesLoadedOnce) {
          recipesLoadedOnce = true;
          setCloudLoaded(true);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'recipes')
    );

    // Active shopping list listener
    const shoppingRef = doc(db, 'shoppingLists', uid);
    const unsubShopping = onSnapshot(
      shoppingRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setCloudShopping({
            id: snap.id,
            ownerId: String(data.ownerId || uid),
            title: String(data.title || 'Weekboodschappen'),
            selectedRecipes: Array.isArray(data.selectedRecipes) ? data.selectedRecipes : [],
            checkedKeys: Array.isArray(data.checkedKeys) ? data.checkedKeys.map(String) : [],
            manualItems: Array.isArray(data.manualItems) ? data.manualItems : [],
            categoryOverrides:
              data.categoryOverrides && typeof data.categoryOverrides === 'object'
                ? data.categoryOverrides
                : {},
          });
        } else {
          setCloudShopping(createEmptyShoppingList(uid));
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `shoppingLists/${uid}`)
    );

    // Recurring staples listener
    const recurringQuery = query(collection(db, 'recurringItems'), where('ownerId', '==', uid));
    const unsubRecurring = onSnapshot(
      recurringQuery,
      (snap) => {
        const list: RecurringItem[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ownerId: String(data.ownerId || uid),
            name: String(data.name || ''),
            defaultAmount: String(data.defaultAmount || '1'),
            defaultUnit: String(data.defaultUnit || ''),
            storageCategory: (data.storageCategory as StorageCategory) || 'proviandkast',
            averageIntervalDays: Number(data.averageIntervalDays) || 14,
            lastPurchasedAtMs: Number(data.lastPurchasedAtMs) || Date.now(),
            purchaseDatesMs: Array.isArray(data.purchaseDatesMs)
              ? data.purchaseDatesMs.map(Number).filter(Number.isFinite)
              : [],
            notes: String(data.notes || ''),
          };
        });
        setCloudRecurring(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'recurringItems')
    );

    // Family members listener
    const membersQuery = query(collection(db, 'familyMembers'), where('ownerId', '==', uid));
    const unsubMembers = onSnapshot(
      membersQuery,
      (snap) => {
        const list: FamilyMember[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ownerId: String(data.ownerId || uid),
              memberName: String(data.memberName || ''),
              memberEmail: String(data.memberEmail || ''),
              role: (data.role as FamilyRole) || 'viewer',
              status: (data.status as FamilyMemberStatus) || 'pending',
              canViewShoppingList: Boolean(data.canViewShoppingList),
              note: String(data.note || ''),
              createdAtMs: timestampToMs(data.createdAt),
              updatedAtMs: timestampToMs(data.updatedAt),
            };
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
        setCloudFamilyMembers(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'familyMembers')
    );

    // Shared cookbooks listener
    const sharesQuery = query(collection(db, 'sharedCookbooks'), where('ownerId', '==', uid));
    const unsubShares = onSnapshot(
      sharesQuery,
      (snap) => {
        const list: SharedCookbook[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ownerId: String(data.ownerId || uid),
              shareCode: String(data.shareCode || d.id),
              cookbookTitle: String(data.cookbookTitle || 'Ons Familiekookboek'),
              cookbookSubtitle: String(data.cookbookSubtitle || ''),
              familyName: String(data.familyName || 'Familie-editie'),
              sharedByName: String(data.sharedByName || 'Familielid'),
              isActive: Boolean(data.isActive),
              allowCopy: Boolean(data.allowCopy),
              recipeCount: Number(data.recipeCount) || 0,
              recipesSnapshot: Array.isArray(data.recipesSnapshot)
                ? (data.recipesSnapshot as SharedRecipeSnapshot[])
                : [],
              createdAtMs: timestampToMs(data.createdAt),
              updatedAtMs: timestampToMs(data.updatedAt),
            };
          })
          .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
        setCloudSharedCookbooks(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'sharedCookbooks')
    );

    // Self admin-doc check
    const selfAdminRef = doc(db, 'admins', uid);
    const unsubSelfAdmin = onSnapshot(
      selfAdminRef,
      (snap) => {
        setIsListedAdmin(snap.exists());
      },
      () => {
        setIsListedAdmin(false);
      }
    );

    // Bootstrapped admin registry list
    let unsubAdminList: (() => void) | null = null;
    if (user.emailVerified && user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL) {
      unsubAdminList = onSnapshot(
        collection(db, 'admins'),
        (snap) => {
          const list: AdminRecord[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              uid: String(data.uid || d.id),
              email: String(data.email || ''),
              displayName: String(data.displayName || 'Beheerder'),
              grantedBy: String(data.grantedBy || ''),
              createdAtMs: timestampToMs(data.createdAt),
            };
          });
          setCloudAdminRecords(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'admins')
      );
    }

    return () => {
      unsubProfile();
      unsubRecipes();
      unsubShopping();
      unsubRecurring();
      unsubMembers();
      unsubShares();
      unsubSelfAdmin();
      if (unsubAdminList) unsubAdminList();
    };
  }, [authReady, user]);

  // 3. Subscribe to comments for each cloud recipe when authenticated
  const cloudRecipeIdsKey = useMemo(
    () => cloudRecipes.map((r) => r.id).sort().join(','),
    [cloudRecipes]
  );

  useEffect(() => {
    if (!authReady || !user || !cloudRecipeIdsKey) return;
    const uid = user.uid;
    const ids = cloudRecipeIdsKey.split(',').filter(Boolean);
    const unsubs: (() => void)[] = [];

    for (const recipeId of ids) {
      const commentsPath = `recipes/${recipeId}/comments`;
      const q = query(collection(db, 'recipes', recipeId, 'comments'), where('ownerId', '==', uid));
      const unsub = onSnapshot(
        q,
        (snap) => {
          const list: RecipeComment[] = snap.docs
            .map((d) => {
              const data = d.data();
              return {
                id: d.id,
                recipeId,
                ownerId: String(data.ownerId || uid),
                authorName: String(data.authorName || 'Familielid'),
                text: String(data.text || ''),
                createdAtMs: timestampToMs(data.createdAt),
              };
            })
            .sort((a, b) => a.createdAtMs - b.createdAtMs);
          setCloudComments((prev) => ({ ...prev, [recipeId]: list }));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, commentsPath)
      );
      unsubs.push(unsub);
    }

    return () => {
      for (const u of unsubs) u();
    };
  }, [authReady, user, cloudRecipeIdsKey]);

  // Resolved active data
  const recipes = user ? cloudRecipes : localRecipes;
  const commentsByRecipe = user ? cloudComments : localComments;
  const shoppingState = user
    ? cloudShopping || createEmptyShoppingList(user.uid)
    : localShopping;
  const recurringItems = user ? cloudRecurring : localRecurring;
  const profile = user
    ? cloudProfile || { ...DEFAULT_PROFILE, displayName: user.displayName || 'Familie' }
    : localProfile;
  const familyMembers = user ? cloudFamilyMembers : localFamilyMembers;
  const sharedCookbooks = user ? cloudSharedCookbooks : localSharedCookbooks;

  const selectedShoppingRecipeIds = useMemo(
    () => new Set(shoppingState.selectedRecipes.map((s) => s.recipeId)),
    [shoppingState.selectedRecipes]
  );

  const manualItemNamesSet = useMemo(
    () => new Set(shoppingState.manualItems.map((m) => m.name.toLowerCase())),
    [shoppingState.manualItems]
  );

  const filteredRecipes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return recipes.filter((r) => {
      if (selectedCategory !== 'Alle' && r.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.subtitle.toLowerCase().includes(q) ||
        r.authorName.toLowerCase().includes(q) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(q))
      );
    });
  }, [recipes, searchQuery, selectedCategory]);

  const activeDetailRecipe = useMemo(
    () => recipes.find((r) => r.id === detailRecipeId) || null,
    [recipes, detailRecipeId]
  );

  const totalCommentsCount = useMemo(
    () => Object.values(commentsByRecipe).reduce((sum, list) => sum + list.length, 0),
    [commentsByRecipe]
  );

  // Auth Actions
  const handleSignIn = async () => {
    setAuthError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Inloggen met Google is geannuleerd.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError('Inloggen met Google is mislukt. Probeer het opnieuw.');
      }
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  // Seed starter family recipes + starter recurring items into Firestore
  const handleSeedCloudRecipes = async () => {
    if (!user) return;
    setSeedingCloud(true);
    const uid = user.uid;
    try {
      const starters = createStarterRecipes(uid);
      const starterComments = createStarterComments(uid);
      const starterRecurring = createStarterRecurringItems(uid);
      const recipeBatch = writeBatch(db);
      const pendingComments: { recId: string; cmt: RecipeComment }[] = [];

      for (const rec of starters) {
        const recId = `rec_${rec.id}_${Date.now().toString(36)}`;
        const recRef = doc(db, 'recipes', recId);
        recipeBatch.set(recRef, {
          ownerId: uid,
          title: rec.title,
          subtitle: rec.subtitle,
          story: rec.story,
          category: rec.category,
          prepMinutes: rec.prepMinutes,
          cookMinutes: rec.cookMinutes,
          servings: rec.servings,
          authorName: rec.authorName,
          coverImage: rec.coverImage,
          extraImages: rec.extraImages,
          videoUrl: rec.videoUrl,
          videoTitle: rec.videoTitle,
          videoLocalId: rec.videoLocalId,
          ingredients: rec.ingredients,
          steps: rec.steps,
          notes: rec.notes,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const recComments = starterComments[rec.id] || [];
        for (const cmt of recComments) {
          pendingComments.push({ recId, cmt });
        }
      }

      if (cloudRecurring.length === 0) {
        for (const item of starterRecurring) {
          const itemId = `staple_${item.id}_${Date.now().toString(36)}`;
          recipeBatch.set(doc(db, 'recurringItems', itemId), {
            ownerId: uid,
            name: item.name,
            defaultAmount: item.defaultAmount,
            defaultUnit: item.defaultUnit,
            storageCategory: item.storageCategory,
            averageIntervalDays: item.averageIntervalDays,
            lastPurchasedAtMs: item.lastPurchasedAtMs,
            purchaseDatesMs: item.purchaseDatesMs,
            notes: item.notes,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      await recipeBatch.commit();

      if (pendingComments.length > 0) {
        const commentBatch = writeBatch(db);
        for (const { recId, cmt } of pendingComments) {
          const cmtId = `cmt_${cmt.id}_${Date.now().toString(36)}`;
          const cmtRef = doc(db, 'recipes', recId, 'comments', cmtId);
          commentBatch.set(cmtRef, {
            recipeId: recId,
            ownerId: uid,
            authorName: cmt.authorName,
            text: cmt.text,
            createdAt: serverTimestamp(),
          });
        }
        await commentBatch.commit();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'recipes');
    } finally {
      setSeedingCloud(false);
    }
  };

  // Save Profile (including ingredientMemory)
  const handleSaveProfile = useCallback(
    async (next: UserProfile) => {
      if (!user) {
        setLocalProfile(next);
        return;
      }
      const uid = user.uid;
      const ref = doc(db, 'users', uid);
      try {
        const existingSnap = await getDoc(ref);
        const sanitizedMemory: Record<string, StorageCategory> = {};
        for (const [k, v] of Object.entries(next.ingredientMemory || {}).slice(0, 300)) {
          sanitizedMemory[k] = v;
        }
        if (existingSnap.exists()) {
          await updateDoc(ref, {
            displayName: (next.displayName || 'Familie').slice(0, 100),
            cookbookTitle: (next.cookbookTitle || 'Ons Familiekookboek').slice(0, 120),
            cookbookSubtitle: next.cookbookSubtitle.slice(0, 200),
            familyName: next.familyName.slice(0, 100),
            ingredientMemory: sanitizedMemory,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            displayName: (next.displayName || 'Familie').slice(0, 100),
            cookbookTitle: (next.cookbookTitle || 'Ons Familiekookboek').slice(0, 120),
            cookbookSubtitle: next.cookbookSubtitle.slice(0, 200),
            familyName: next.familyName.slice(0, 100),
            ingredientMemory: sanitizedMemory,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
      }
    },
    [user]
  );

  // Remember user's Vers / Voorraad preference per ingredient across the whole app
  const handleRememberIngredientCategory = useCallback(
    async (ingredientName: string, category: StorageCategory) => {
      const key = normalizeIngredientKey(ingredientName);
      if (!key) return;
      const nextProfile: UserProfile = {
        ...profile,
        ingredientMemory: {
          ...profile.ingredientMemory,
          [key]: category,
        },
      };
      await handleSaveProfile(nextProfile);
    },
    [profile, handleSaveProfile]
  );

  const handleRemoveIngredientMemory = async (key: string) => {
    const nextMemory = { ...(profile.ingredientMemory || {}) };
    delete nextMemory[key];
    await handleSaveProfile({ ...profile, ingredientMemory: nextMemory });
  };

  const handleFlipIngredientMemory = async (key: string, nextCat: StorageCategory) => {
    await handleSaveProfile({
      ...profile,
      ingredientMemory: {
        ...(profile.ingredientMemory || {}),
        [key]: nextCat,
      },
    });
  };

  // Family Members CRUD (Share & RBAC)
  const handleAddFamilyMember = async (data: {
    memberName: string;
    memberEmail: string;
    role: FamilyRole;
    canViewShoppingList: boolean;
    note: string;
  }) => {
    const newId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();
    if (!user) {
      setLocalFamilyMembers((prev) => [
        {
          id: newId,
          ownerId: 'local',
          memberName: data.memberName.slice(0, 100),
          memberEmail: data.memberEmail.toLowerCase().slice(0, 160),
          role: data.role,
          status: 'pending',
          canViewShoppingList: data.canViewShoppingList,
          note: data.note.slice(0, 240),
          createdAtMs: now,
          updatedAtMs: now,
        },
        ...prev,
      ]);
      return;
    }
    const path = `familyMembers/${newId}`;
    try {
      await setDoc(doc(db, 'familyMembers', newId), {
        ownerId: user.uid,
        memberName: data.memberName.slice(0, 100),
        memberEmail: data.memberEmail.toLowerCase().slice(0, 160),
        role: data.role,
        status: 'pending',
        canViewShoppingList: data.canViewShoppingList,
        note: data.note.slice(0, 240),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const handleUpdateFamilyMember = async (
    member: FamilyMember,
    updates: Partial<Pick<FamilyMember, 'role' | 'status' | 'canViewShoppingList' | 'note'>>
  ) => {
    if (!user) {
      setLocalFamilyMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, ...updates, updatedAtMs: Date.now() } : m))
      );
      return;
    }
    const path = `familyMembers/${member.id}`;
    try {
      await updateDoc(doc(db, 'familyMembers', member.id), {
        ...(updates.role !== undefined ? { role: updates.role } : {}),
        ...(updates.status !== undefined ? { status: updates.status } : {}),
        ...(updates.canViewShoppingList !== undefined
          ? { canViewShoppingList: updates.canViewShoppingList }
          : {}),
        ...(updates.note !== undefined ? { note: updates.note.slice(0, 240) } : {}),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleDeleteFamilyMember = async (memberId: string) => {
    if (!user) {
      setLocalFamilyMembers((prev) => prev.filter((m) => m.id !== memberId));
      return;
    }
    const path = `familyMembers/${memberId}`;
    try {
      await deleteDoc(doc(db, 'familyMembers', memberId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  // Shared Cookbook Links CRUD (Read-only zero-PII snapshots)
  const buildSanitizedSnapshots = (recipeIds: string[]): SharedRecipeSnapshot[] => {
    const idSet = new Set(recipeIds);
    return recipes
      .filter((r) => idSet.has(r.id))
      .slice(0, 30)
      .map((r) => ({
        id: r.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'rec',
        title: r.title.slice(0, 140),
        subtitle: r.subtitle.slice(0, 220),
        story: r.story.slice(0, 3000),
        category: r.category,
        prepMinutes: Math.max(0, Math.min(1440, r.prepMinutes)),
        cookMinutes: Math.max(0, Math.min(2880, r.cookMinutes)),
        servings: Math.max(1, Math.min(100, r.servings)),
        authorName: (r.authorName || 'Familielid').slice(0, 100),
        coverImage: r.coverImage.length <= 200000 ? r.coverImage : '',
        ingredients: r.ingredients.slice(0, 60).map((ing, idx) => ({
          id: (ing.id || `ing_${idx}`).slice(0, 64),
          name: ing.name.slice(0, 150),
          amount: String(ing.amount || '').slice(0, 40),
          unit: String(ing.unit || '').slice(0, 40),
          storageCategory: ing.storageCategory,
        })),
        steps: r.steps
          .filter((s) => s.trim().length > 0)
          .slice(0, 40)
          .map((s) => s.slice(0, 1500)),
        notes: r.notes.slice(0, 2000),
      }));
  };

  const handleCreateOrSyncShareLink = async (options: {
    existingShare?: SharedCookbook;
    recipeIds: string[];
    allowCopy: boolean;
    isActive: boolean;
  }) => {
    const snapshots = buildSanitizedSnapshots(options.recipeIds);
    const shareCode =
      options.existingShare?.shareCode ||
      `tfb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const now = Date.now();
    const sharedByName = (user?.displayName || profile.displayName || 'Familie').slice(0, 100);

    if (!user) {
      const nextItem: SharedCookbook = {
        id: shareCode,
        ownerId: 'local',
        shareCode,
        cookbookTitle: (profile.cookbookTitle || 'Ons Familiekookboek').slice(0, 120),
        cookbookSubtitle: profile.cookbookSubtitle.slice(0, 200),
        familyName: profile.familyName.slice(0, 100),
        sharedByName,
        isActive: options.isActive,
        allowCopy: options.allowCopy,
        recipeCount: snapshots.length,
        recipesSnapshot: snapshots,
        createdAtMs: options.existingShare?.createdAtMs || now,
        updatedAtMs: now,
      };
      setLocalSharedCookbooks((prev) => [
        nextItem,
        ...prev.filter((s) => s.shareCode !== shareCode),
      ]);
      return;
    }

    const path = `sharedCookbooks/${shareCode}`;
    try {
      if (options.existingShare) {
        await updateDoc(doc(db, 'sharedCookbooks', shareCode), {
          cookbookTitle: (profile.cookbookTitle || 'Ons Familiekookboek').slice(0, 120),
          cookbookSubtitle: profile.cookbookSubtitle.slice(0, 200),
          familyName: profile.familyName.slice(0, 100),
          sharedByName,
          isActive: options.isActive,
          allowCopy: options.allowCopy,
          recipeCount: snapshots.length,
          recipesSnapshot: snapshots,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'sharedCookbooks', shareCode), {
          ownerId: user.uid,
          shareCode,
          cookbookTitle: (profile.cookbookTitle || 'Ons Familiekookboek').slice(0, 120),
          cookbookSubtitle: profile.cookbookSubtitle.slice(0, 200),
          familyName: profile.familyName.slice(0, 100),
          sharedByName,
          isActive: options.isActive,
          allowCopy: options.allowCopy,
          recipeCount: snapshots.length,
          recipesSnapshot: snapshots,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(
        err,
        options.existingShare ? OperationType.UPDATE : OperationType.CREATE,
        path
      );
    }
  };

  const handleToggleShareActive = async (share: SharedCookbook) => {
    if (!user) {
      setLocalSharedCookbooks((prev) =>
        prev.map((s) =>
          s.shareCode === share.shareCode
            ? { ...s, isActive: !s.isActive, updatedAtMs: Date.now() }
            : s
        )
      );
      return;
    }
    const path = `sharedCookbooks/${share.shareCode}`;
    try {
      await updateDoc(doc(db, 'sharedCookbooks', share.shareCode), {
        isActive: !share.isActive,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleDeleteShareLink = async (shareCode: string) => {
    if (!user) {
      setLocalSharedCookbooks((prev) => prev.filter((s) => s.shareCode !== shareCode));
      return;
    }
    const path = `sharedCookbooks/${shareCode}`;
    try {
      await deleteDoc(doc(db, 'sharedCookbooks', shareCode));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  // RBAC Admin Registry CRUD
  const handleAddAdminRecord = async (data: {
    uid: string;
    email: string;
    displayName: string;
  }) => {
    if (!user || !isAdmin) return;
    const path = `admins/${data.uid}`;
    try {
      await setDoc(doc(db, 'admins', data.uid), {
        uid: data.uid,
        email: data.email.toLowerCase().slice(0, 160),
        displayName: data.displayName.slice(0, 100),
        grantedBy: user.uid,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const handleRemoveAdminRecord = async (adminUid: string) => {
    if (!user || !isAdmin || adminUid === user.uid) return;
    const path = `admins/${adminUid}`;
    try {
      await deleteDoc(doc(db, 'admins', adminUid));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  // Copy recipe from a shared cookbook into own book
  const handleCopySharedRecipeToOwn = async (snap: SharedRecipeSnapshot) => {
    await handleSaveRecipe({
      title: snap.title,
      subtitle: snap.subtitle,
      story: snap.story,
      category: snap.category,
      prepMinutes: snap.prepMinutes,
      cookMinutes: snap.cookMinutes,
      servings: snap.servings,
      authorName: snap.authorName,
      coverImage: snap.coverImage,
      extraImages: [],
      videoUrl: '',
      videoTitle: '',
      videoLocalId: '',
      ingredients: snap.ingredients,
      steps: snap.steps,
      notes: snap.notes,
    });
  };

  // Import JSON backup
  const handleImportBackup = async (payload: FullBackupPayload): Promise<number> => {
    const validRecipes = payload.recipes
      .filter((r) => r && typeof r.title === 'string' && r.title.trim().length > 0)
      .slice(0, 30);

    if (payload.profile) {
      await handleSaveProfile({
        ...profile,
        ...payload.profile,
        ingredientMemory: {
          ...(profile.ingredientMemory || {}),
          ...(payload.profile.ingredientMemory || {}),
        },
      });
    }

    for (const r of validRecipes) {
      await handleSaveRecipe({
        title: r.title.slice(0, 140),
        subtitle: String(r.subtitle || '').slice(0, 220),
        story: String(r.story || '').slice(0, 3000),
        category: RECIPE_CATEGORIES.includes(r.category) ? r.category : 'Hoofdgerecht',
        prepMinutes: Number(r.prepMinutes) || 0,
        cookMinutes: Number(r.cookMinutes) || 0,
        servings: Math.max(1, Number(r.servings) || 4),
        authorName: String(r.authorName || profile.displayName || 'Familie').slice(0, 100),
        coverImage: typeof r.coverImage === 'string' && r.coverImage.length <= 350000 ? r.coverImage : '',
        extraImages: Array.isArray(r.extraImages) ? r.extraImages.slice(0, 3) : [],
        videoUrl: String(r.videoUrl || '').slice(0, 600),
        videoTitle: String(r.videoTitle || '').slice(0, 160),
        videoLocalId: '',
        ingredients: Array.isArray(r.ingredients) ? r.ingredients.slice(0, 60) : [],
        steps: Array.isArray(r.steps) ? r.steps.slice(0, 40) : [],
        notes: String(r.notes || '').slice(0, 2000),
      });
    }

    return validRecipes.length;
  };

  // Recurring Items CRUD
  const handleAddRecurringItem = async (data: Omit<RecurringItem, 'id' | 'ownerId'>) => {
    const newId = `staple_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    if (!user) {
      setLocalRecurring((prev) => [
        ...prev,
        {
          ...data,
          id: newId,
          ownerId: 'local',
        },
      ]);
      return;
    }

    const path = `recurringItems/${newId}`;
    try {
      await setDoc(doc(db, 'recurringItems', newId), {
        ownerId: user.uid,
        name: data.name.slice(0, 150),
        defaultAmount: data.defaultAmount.slice(0, 40),
        defaultUnit: data.defaultUnit.slice(0, 40),
        storageCategory: data.storageCategory,
        averageIntervalDays: Math.max(1, Math.min(365, Math.round(data.averageIntervalDays))),
        lastPurchasedAtMs: data.lastPurchasedAtMs,
        purchaseDatesMs: data.purchaseDatesMs.slice(-100),
        notes: data.notes.slice(0, 300),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const handleLogRecurringPurchase = async (item: RecurringItem, purchaseDateMs: number) => {
    const updatedDates = [...item.purchaseDatesMs, purchaseDateMs]
      .sort((a, b) => a - b)
      .slice(-100);
    const nextAvg = computeAverageIntervalDays(updatedDates, item.averageIntervalDays);
    const nextLastMs = Math.max(item.lastPurchasedAtMs, purchaseDateMs);

    if (!user) {
      setLocalRecurring((prev) =>
        prev.map((r) =>
          r.id === item.id
            ? {
                ...r,
                purchaseDatesMs: updatedDates,
                averageIntervalDays: nextAvg,
                lastPurchasedAtMs: nextLastMs,
              }
            : r
        )
      );
      return;
    }

    const path = `recurringItems/${item.id}`;
    try {
      await updateDoc(doc(db, 'recurringItems', item.id), {
        purchaseDatesMs: updatedDates,
        averageIntervalDays: Math.max(1, Math.min(365, nextAvg)),
        lastPurchasedAtMs: nextLastMs,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleDeleteRecurringItem = async (itemId: string) => {
    if (!user) {
      setLocalRecurring((prev) => prev.filter((r) => r.id !== itemId));
      return;
    }
    const path = `recurringItems/${itemId}`;
    try {
      await deleteDoc(doc(db, 'recurringItems', itemId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  // Create or Update Recipe
  const handleSaveRecipe = async (formData: RecipeFormData, existingId?: string) => {
    if (!user) {
      const now = Date.now();
      if (existingId) {
        setLocalRecipes((prev) =>
          prev.map((r) => (r.id === existingId ? { ...r, ...formData, updatedAtMs: now } : r))
        );
      } else {
        const id = `local_rec_${now}`;
        const created: Recipe = {
          ...formData,
          id,
          ownerId: 'local',
          createdAtMs: now,
          updatedAtMs: now,
        };
        setLocalRecipes((prev) => [created, ...prev]);
        setDetailRecipeId(id);
      }
      return;
    }

    const uid = user.uid;
    if (existingId) {
      const ref = doc(db, 'recipes', existingId);
      try {
        await updateDoc(ref, {
          ...formData,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `recipes/${existingId}`);
      }
    } else {
      const newId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const ref = doc(db, 'recipes', newId);
      try {
        await setDoc(ref, {
          ...formData,
          ownerId: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setDetailRecipeId(newId);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `recipes/${newId}`);
      }
    }
  };

  // Delete Recipe
  const handleDeleteRecipe = async (recipeId: string) => {
    if (!user) {
      setLocalRecipes((prev) => prev.filter((r) => r.id !== recipeId));
      setLocalShopping((prev) => ({
        ...prev,
        selectedRecipes: prev.selectedRecipes.filter((s) => s.recipeId !== recipeId),
      }));
      setDetailRecipeId(null);
      return;
    }

    try {
      await deleteDoc(doc(db, 'recipes', recipeId));
      setDetailRecipeId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `recipes/${recipeId}`);
    }
  };

  // Add Comment
  const handleAddComment = async (recipeId: string, authorName: string, text: string) => {
    if (!user) {
      const newComment: RecipeComment = {
        id: `local_cmt_${Date.now()}`,
        recipeId,
        ownerId: 'local',
        authorName,
        text,
        createdAtMs: Date.now(),
      };
      setLocalComments((prev) => ({
        ...prev,
        [recipeId]: [...(prev[recipeId] || []), newComment],
      }));
      return;
    }

    const commentId = `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const path = `recipes/${recipeId}/comments/${commentId}`;
    try {
      await setDoc(doc(db, 'recipes', recipeId, 'comments', commentId), {
        recipeId,
        ownerId: user.uid,
        authorName: authorName.slice(0, 100),
        text: text.slice(0, 1500),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  // Delete Comment
  const handleDeleteComment = async (recipeId: string, commentId: string) => {
    if (!user) {
      setLocalComments((prev) => ({
        ...prev,
        [recipeId]: (prev[recipeId] || []).filter((c) => c.id !== commentId),
      }));
      return;
    }

    const path = `recipes/${recipeId}/comments/${commentId}`;
    try {
      await deleteDoc(doc(db, 'recipes', recipeId, 'comments', commentId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  // Persist Shopping List state
  const persistCloudShopping = useCallback(
    async (nextState: ShoppingListState) => {
      if (!user) return;
      const uid = user.uid;
      const ref = doc(db, 'shoppingLists', uid);
      try {
        const snap = await getDoc(ref);
        const sanitizedPayload = {
          title: (nextState.title || 'Weekboodschappen').slice(0, 120),
          selectedRecipes: nextState.selectedRecipes.slice(0, 30),
          checkedKeys: nextState.checkedKeys.slice(0, 200),
          manualItems: nextState.manualItems.slice(0, 60),
          categoryOverrides: nextState.categoryOverrides,
          updatedAt: serverTimestamp(),
        };
        if (snap.exists()) {
          await updateDoc(ref, sanitizedPayload);
        } else {
          await setDoc(ref, {
            ownerId: uid,
            ...sanitizedPayload,
            createdAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `shoppingLists/${uid}`);
      }
    },
    [user]
  );

  const handleUpdateShoppingState = useCallback(
    (updater: (prev: ShoppingListState) => ShoppingListState) => {
      if (!user) {
        setLocalShopping(updater);
        return;
      }

      setCloudShopping((prev) => {
        const base = prev || createEmptyShoppingList(user.uid);
        const next = updater(base);
        if (shoppingSyncTimerRef.current) {
          window.clearTimeout(shoppingSyncTimerRef.current);
        }
        shoppingSyncTimerRef.current = window.setTimeout(() => {
          void persistCloudShopping(next);
        }, 350);
        return next;
      });
    },
    [user, persistCloudShopping]
  );

  const handleToggleRecipeOnShoppingList = (recipe: Recipe, servings = recipe.servings) => {
    handleUpdateShoppingState((prev) => {
      const exists = prev.selectedRecipes.some((s) => s.recipeId === recipe.id);
      if (exists) {
        return {
          ...prev,
          selectedRecipes: prev.selectedRecipes.filter((s) => s.recipeId !== recipe.id),
        };
      }
      return {
        ...prev,
        selectedRecipes: [...prev.selectedRecipes, { recipeId: recipe.id, servings }].slice(0, 30),
      };
    });
  };

  const handleAddSeasonalProduceToShopping = (produceName: string) => {
    handleUpdateShoppingState((prev) => {
      if (prev.manualItems.some((m) => m.name.toLowerCase() === produceName.toLowerCase())) {
        return prev;
      }
      return {
        ...prev,
        manualItems: [
          ...prev.manualItems,
          {
            id: `sea_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            name: produceName.slice(0, 150),
            amount: '1',
            unit: '',
            storageCategory: 'vers' as const,
            checked: false,
          },
        ].slice(0, 60),
      };
    });
  };

  // If visiting a shared cookbook link (?share=...) or previewing one
  if (sharedLookupLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] text-sm text-zinc-600">
        Gedeeld familiekookboek laden...
      </div>
    );
  }

  if (viewingSharedCookbook) {
    return (
      <SharedCookbookView
        sharedCookbook={viewingSharedCookbook}
        canImportToOwnBook={true}
        onCopyRecipeToOwnBook={handleCopySharedRecipeToOwn}
        onExitSharedView={() => {
          setViewingSharedCookbook(null);
          if (window.location.search.includes('share=')) {
            window.history.replaceState({}, '', window.location.pathname);
          }
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] text-[#111315]">
      {/* Strict 3-Zone Top Bar Contract (5 single-line nav links) */}
      <header className="sticky top-0 z-30 bg-[#FAFAFA]/95 backdrop-blur-sm border-b border-zinc-200 no-print">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('kookboek')}
            className="font-editorial text-xl font-semibold tracking-tight text-zinc-950 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Tafelboek
          </button>

          {/* Zone 2: 5 clean single-line text navigation links */}
          <nav
            aria-label="Hoofdnavigatie"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-600"
          >
            <button
              type="button"
              onClick={() => setActiveTab('kookboek')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
                activeTab === 'kookboek'
                  ? 'text-zinc-950 border-[#14532D]'
                  : 'border-transparent hover:text-zinc-950'
              }`}
            >
              Kookboek
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('boodschappen')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
                activeTab === 'boodschappen'
                  ? 'text-zinc-950 border-[#14532D]'
                  : 'border-transparent hover:text-zinc-950'
              }`}
            >
              Boodschappen ({shoppingState.selectedRecipes.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('seizoen')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
                activeTab === 'seizoen'
                  ? 'text-zinc-950 border-[#14532D]'
                  : 'border-transparent hover:text-zinc-950'
              }`}
            >
              Seizoen
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pdf')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
                activeTab === 'pdf'
                  ? 'text-zinc-950 border-[#14532D]'
                  : 'border-transparent hover:text-zinc-950'
              }`}
            >
              PDF Kookboek
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('beheer')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
                activeTab === 'beheer'
                  ? 'text-zinc-950 border-[#14532D]'
                  : 'border-transparent hover:text-zinc-950'
              }`}
            >
              Beheer
            </button>
          </nav>

          {/* Zone 3: PWA install + primary CTA button */}
          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton variant="compact" />
            <button
              type="button"
              onClick={() => {
                setEditingRecipe(null);
                setEditorOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Nieuw recept
            </button>
          </div>
        </div>

        {/* Compact Mobile Tab Strip */}
        <div className="md:hidden border-t border-zinc-200 px-3 py-2 flex items-center justify-between gap-1 text-xs font-medium bg-[#FAFAFA] overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('kookboek')}
            className={`px-2.5 py-1.5 rounded-md whitespace-nowrap ${
              activeTab === 'kookboek' ? 'bg-zinc-900 text-white' : 'text-zinc-600'
            }`}
          >
            Kookboek
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('boodschappen')}
            className={`px-2.5 py-1.5 rounded-md whitespace-nowrap ${
              activeTab === 'boodschappen' ? 'bg-zinc-900 text-white' : 'text-zinc-600'
            }`}
          >
            Lijst ({shoppingState.selectedRecipes.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('seizoen')}
            className={`px-2.5 py-1.5 rounded-md whitespace-nowrap ${
              activeTab === 'seizoen' ? 'bg-zinc-900 text-white' : 'text-zinc-600'
            }`}
          >
            Seizoen
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pdf')}
            className={`px-2.5 py-1.5 rounded-md whitespace-nowrap ${
              activeTab === 'pdf' ? 'bg-zinc-900 text-white' : 'text-zinc-600'
            }`}
          >
            PDF
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('beheer')}
            className={`px-2.5 py-1.5 rounded-md whitespace-nowrap ${
              activeTab === 'beheer' ? 'bg-zinc-900 text-white' : 'text-zinc-600'
            }`}
          >
            Beheer
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-5 sm:px-8 py-8 sm:py-10">
        {authReady && !user && (
          <div className="mb-7 px-5 py-3 bg-white border border-zinc-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
            <div className="flex items-center gap-3 text-sm text-zinc-700">
              <Cloud className="w-4 h-4 text-[#14532D] shrink-0" />
              <span>
                Je bekijkt de voorbeeld-editie. Log in met Google om recepten, vaste boodschappen en je Vers/Voorraad-geheugen blijvend op te slaan.
              </span>
            </div>
            <button
              type="button"
              onClick={handleSignIn}
              className="px-4 py-2 text-xs font-medium text-[#14532D] bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto cursor-pointer"
            >
              Inloggen met Google
            </button>
          </div>
        )}

        {sharedLookupError && (
          <div className="mb-6 px-4 py-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3">
            <span>{sharedLookupError}</span>
            <button
              type="button"
              onClick={() => {
                setSharedLookupError('');
                window.history.replaceState({}, '', window.location.pathname);
              }}
              className="text-xs font-medium underline cursor-pointer"
            >
              Sluiten
            </button>
          </div>
        )}

        {authError && (
          <div className="mb-6 px-4 py-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl">
            {authError}
          </div>
        )}

        {activeTab === 'kookboek' && (
          <div className="space-y-12">
            {/* Editorial Split Hero */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              <div className="lg:col-span-6 flex flex-col justify-between bg-white border border-zinc-200 rounded-2xl p-7 sm:p-10">
                <div className="space-y-5">
                  <p className="text-xs font-medium text-[#14532D] tracking-wide">
                    {user
                      ? `${profile.cookbookTitle} · Ingelogd als ${user.displayName || user.email}`
                      : 'Familiekookboek, slimme boodschappen & Belgische seizoenskalender'}
                  </p>
                  <h1 className="font-editorial text-4xl sm:text-5xl font-semibold tracking-tight text-zinc-950 leading-[1.08]">
                    Recepten om te koken, te delen en af te drukken.
                  </h1>
                  <p className="text-base text-zinc-600 leading-relaxed max-w-xl">
                    Bewaar familierecepten met foto&apos;s, notities en kookvideo&apos;s. Genereer een compacte boodschappenlijst met Vers vs. Voorraad-geheugen, automatische cyclus-herinneringen (zoals confituur) en de Belgische seizoenskalender.
                  </p>
                </div>

                <div className="pt-8 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRecipe(null);
                      setEditorOpen(true);
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Recept toevoegen
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('boodschappen')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-zinc-800 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <ShoppingBasket className="w-4 h-4" />
                    Boodschappenlijst
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('pdf')}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-950 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <FileDown className="w-4 h-4" />
                    PDF-studio
                  </button>
                </div>
              </div>

              <div className="lg:col-span-6 rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-100 min-h-[280px]">
                <RecipeImage
                  src={HERO_TABLE_IMAGE}
                  alt="Opengeslagen familiekookboek op een eikenhouten keukentafel met verse ingrediënten"
                  fallbackTitle="Tafelboek"
                  className="w-full h-full object-cover"
                />
              </div>
            </section>

            {/* Full-Width 4-Column Overview Strip */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-zinc-200 rounded-xl p-5">
                <p className="text-xs text-zinc-500">Recepten in kookboek</p>
                <p className="mt-1 font-mono text-2xl font-medium text-zinc-950 tabular-nums">
                  {recipes.length}
                </p>
              </div>
              <div className="bg-white border border-zinc-200 rounded-xl p-5">
                <p className="text-xs text-zinc-500">Familienotities</p>
                <p className="mt-1 font-mono text-2xl font-medium text-zinc-950 tabular-nums">
                  {totalCommentsCount}
                </p>
              </div>
              <div className="bg-white border border-zinc-200 rounded-xl p-5">
                <p className="text-xs text-zinc-500">Vaste boodschappen gevolgd</p>
                <p className="mt-1 font-mono text-2xl font-medium text-zinc-950 tabular-nums">
                  {recurringItems.length}
                </p>
              </div>
              <div className="bg-white border border-zinc-200 rounded-xl p-5">
                <p className="text-xs text-zinc-500">Onthouden Vers/Voorraad</p>
                <p className="mt-1 font-mono text-2xl font-medium text-[#14532D] tabular-nums">
                  {Object.keys(profile.ingredientMemory || {}).length}
                </p>
              </div>
            </section>

            {/* Cookbook Collection & Filters */}
            <section className="space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-200">
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {(['Alle', ...RECIPE_CATEGORIES] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-zinc-900 text-white'
                          : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="relative w-full lg:w-72 shrink-0">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Zoek recept, ingrediënt of auteur..."
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                  />
                </div>
              </div>

              {user && cloudLoaded && recipes.length === 0 ? (
                <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center space-y-4">
                  <BookOpen className="w-9 h-9 text-zinc-300 mx-auto" strokeWidth={1.5} />
                  <h2 className="font-editorial text-2xl font-semibold text-zinc-950">
                    Jullie familiekookboek is nog leeg
                  </h2>
                  <p className="text-sm text-zinc-600 max-w-md mx-auto leading-relaxed">
                    Begin direct met je eigen familierecept of laad eerst onze 4 klassiekers en voorbeeld-boodschappencycli in je account.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleSeedCloudRecipes}
                      disabled={seedingCloud}
                      className="px-4 py-2.5 text-sm font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 cursor-pointer"
                    >
                      {seedingCloud ? 'Voorbeelden laden...' : 'Laad voorbeeldrecepten & cyclus'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRecipe(null);
                        setEditorOpen(true);
                      }}
                      className="px-4 py-2.5 text-sm font-medium text-zinc-800 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Schrijf mijn eerste recept
                    </button>
                  </div>
                </div>
              ) : filteredRecipes.length === 0 ? (
                <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center space-y-2">
                  <p className="font-editorial text-xl font-semibold text-zinc-900">
                    Geen recepten gevonden
                  </p>
                  <p className="text-sm text-zinc-500">
                    Pas je zoekterm of hoofdstukfilter aan om andere familierecepten te zien.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                  {filteredRecipes.map((recipe) => {
                    const isOnList = selectedShoppingRecipeIds.has(recipe.id);
                    const commentCount = (commentsByRecipe[recipe.id] || []).length;
                    const hasVideo = Boolean(recipe.videoUrl || recipe.videoLocalId);
                    const totalMinutes = recipe.prepMinutes + recipe.cookMinutes;

                    return (
                      <article
                        key={recipe.id}
                        className="group bg-white border border-zinc-200 rounded-2xl overflow-hidden flex flex-col transition-colors hover:border-zinc-300"
                      >
                        <button
                          type="button"
                          onClick={() => setDetailRecipeId(recipe.id)}
                          className="aspect-[4/3] w-full overflow-hidden bg-zinc-100 text-left cursor-pointer"
                        >
                          <RecipeImage
                            src={recipe.coverImage}
                            alt={recipe.title}
                            fallbackTitle={recipe.title}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          />
                        </button>

                        <div className="p-6 flex-1 flex flex-col justify-between gap-5">
                          <div className="space-y-2.5">
                            <div className="flex items-center gap-2 text-xs text-zinc-500 tabular-nums">
                              <span className="font-medium text-[#14532D]">{recipe.category}</span>
                              <span aria-hidden="true">·</span>
                              <span className="truncate">{recipe.authorName}</span>
                              <span aria-hidden="true">·</span>
                              <span className="whitespace-nowrap">{totalMinutes} min</span>
                            </div>

                            <button
                              type="button"
                              onClick={() => setDetailRecipeId(recipe.id)}
                              className="text-left block w-full cursor-pointer"
                            >
                              <h2 className="font-editorial text-xl font-semibold text-zinc-950 group-hover:text-[#14532D] transition-colors leading-snug">
                                {recipe.title}
                              </h2>
                            </button>

                            {recipe.subtitle && (
                              <p className="text-sm text-zinc-600 line-clamp-2 leading-relaxed">
                                {recipe.subtitle}
                              </p>
                            )}
                          </div>

                          <div className="pt-4 border-t border-zinc-100 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-xs text-zinc-500 tabular-nums">
                              <span>{recipe.ingredients.length} ingr.</span>
                              {commentCount > 0 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{commentCount} notities</span>
                                </>
                              )}
                              {hasVideo && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="inline-flex items-center gap-1 text-zinc-700">
                                    <Video className="w-3.5 h-3.5" />
                                    Video
                                  </span>
                                </>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleToggleRecipeOnShoppingList(recipe)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                isOnList
                                  ? 'bg-[#14532D] text-white hover:bg-[#166534]'
                                  : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
                              }`}
                            >
                              {isOnList ? (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  Op lijst
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3.5 h-3.5" />
                                  Boodschappen
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'boodschappen' && (
          <ShoppingListView
            recipes={recipes}
            shoppingState={shoppingState}
            ingredientMemory={profile.ingredientMemory || {}}
            recurringItems={recurringItems}
            onUpdateShoppingState={handleUpdateShoppingState}
            onRememberIngredientCategory={handleRememberIngredientCategory}
            onAddRecurringItem={handleAddRecurringItem}
            onLogRecurringPurchase={handleLogRecurringPurchase}
            onDeleteRecurringItem={handleDeleteRecurringItem}
            onOpenRecipe={(recipe) => setDetailRecipeId(recipe.id)}
          />
        )}

        {activeTab === 'seizoen' && (
          <SeasonTrackerView
            recipes={recipes}
            addedItemNames={manualItemNamesSet}
            onAddProduceToShopping={handleAddSeasonalProduceToShopping}
            onOpenRecipe={(recipe) => setDetailRecipeId(recipe.id)}
            onToggleRecipeOnShopping={(recipe) => handleToggleRecipeOnShoppingList(recipe)}
            selectedRecipeIds={selectedShoppingRecipeIds}
          />
        )}

        {activeTab === 'pdf' && (
          <PdfCookbookStudio
            recipes={recipes}
            commentsByRecipe={commentsByRecipe}
            profile={profile}
            onSaveProfile={handleSaveProfile}
          />
        )}

        {activeTab === 'beheer' && (
          <AdminShareView
            userEmail={user?.email || null}
            userUid={user?.uid || null}
            userDisplayName={user?.displayName || null}
            isSignedIn={Boolean(user)}
            isAdmin={isAdmin}
            isBootstrappedAdmin={isBootstrappedAdmin}
            profile={profile}
            recipes={recipes}
            commentsByRecipe={commentsByRecipe}
            shoppingState={shoppingState}
            recurringItems={recurringItems}
            familyMembers={familyMembers}
            sharedCookbooks={sharedCookbooks}
            adminRecords={cloudAdminRecords}
            onSignIn={handleSignIn}
            onSignOut={handleSignOut}
            onSaveProfile={handleSaveProfile}
            onEditRecipe={(rec) => {
              setEditingRecipe(rec);
              setEditorOpen(true);
            }}
            onDeleteRecipe={handleDeleteRecipe}
            onDeleteComment={handleDeleteComment}
            onRemoveIngredientMemory={handleRemoveIngredientMemory}
            onFlipIngredientMemory={handleFlipIngredientMemory}
            onAddFamilyMember={handleAddFamilyMember}
            onUpdateFamilyMember={handleUpdateFamilyMember}
            onDeleteFamilyMember={handleDeleteFamilyMember}
            onCreateOrSyncShareLink={handleCreateOrSyncShareLink}
            onToggleShareActive={handleToggleShareActive}
            onDeleteShareLink={handleDeleteShareLink}
            onPreviewShareLink={(share) => setViewingSharedCookbook(share)}
            onAddAdminRecord={handleAddAdminRecord}
            onRemoveAdminRecord={handleRemoveAdminRecord}
            onImportBackup={handleImportBackup}
          />
        )}
      </main>

      <OfflineIndicator />

      {/* Quiet Editorial Footer */}
      <footer className="border-t border-zinc-200 bg-white mt-12 no-print">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <span>Tafelboek — Familiekookboek &amp; Boodschappenmanager</span>
          <span>PDF-kookboek · Vers &amp; Voorraad-geheugen · Delen &amp; Beheer · PWA</span>
        </div>
      </footer>

      {/* Recipe Detail Modal */}
      {activeDetailRecipe && (
        <RecipeDetailModal
          recipe={activeDetailRecipe}
          comments={commentsByRecipe[activeDetailRecipe.id] || []}
          isInShoppingList={selectedShoppingRecipeIds.has(activeDetailRecipe.id)}
          defaultAuthorName={user?.displayName || profile.displayName || 'Familielid'}
          onClose={() => setDetailRecipeId(null)}
          onEdit={(rec) => {
            setDetailRecipeId(null);
            setEditingRecipe(rec);
            setEditorOpen(true);
          }}
          onDelete={handleDeleteRecipe}
          onToggleShopping={(rec, serv) => handleToggleRecipeOnShoppingList(rec, serv)}
          onAddComment={handleAddComment}
          onDeleteComment={handleDeleteComment}
        />
      )}

      {/* Recipe Editor Modal */}
      {editorOpen && (
        <RecipeEditorModal
          initialRecipe={editingRecipe}
          defaultAuthorName={user?.displayName || profile.displayName || 'Familielid'}
          ingredientMemory={profile.ingredientMemory || {}}
          onRememberIngredientCategory={handleRememberIngredientCategory}
          onClose={() => {
            setEditorOpen(false);
            setEditingRecipe(null);
          }}
          onSave={handleSaveRecipe}
        />
      )}
    </div>
  );
}
