export type RecipeCategory =
  | 'Hoofdgerecht'
  | 'Voorgerecht'
  | 'Soep'
  | 'Bijgerecht'
  | 'Dessert'
  | 'Ontbijt & Brunch'
  | 'Gebak';

export const RECIPE_CATEGORIES: RecipeCategory[] = [
  'Hoofdgerecht',
  'Voorgerecht',
  'Soep',
  'Bijgerecht',
  'Dessert',
  'Ontbijt & Brunch',
  'Gebak',
];

export type StorageCategory = 'vers' | 'proviandkast' | 'diepvries' | 'bakkerij';

export const STORAGE_CATEGORY_META: Record<
  StorageCategory,
  {
    label: string;
    shortLabel: string;
    description: string;
    accentText: string;
    dotColor: string;
    order: number;
  }
> = {
  vers: {
    label: 'Vers te kopen',
    shortLabel: 'Vers',
    description: 'Groente, fruit, vlees, vis, zuivel en verse kruiden.',
    accentText: 'text-[#14532D]',
    dotColor: 'bg-[#14532D]',
    order: 0,
  },
  proviandkast: {
    label: 'In de voorraad (normaal) — checken',
    shortLabel: 'Voorraad',
    description: 'Proviandkast, droogwaren, olie en kruiden — eerst thuis controleren.',
    accentText: 'text-[#92400E]',
    dotColor: 'bg-[#92400E]',
    order: 1,
  },
  diepvries: {
    label: 'Diepvries',
    shortLabel: 'Diepvries',
    description: 'Diepvriesgroenten, deegwaren en bevroren voorraad.',
    accentText: 'text-[#1E40AF]',
    dotColor: 'bg-[#1E40AF]',
    order: 2,
  },
  bakkerij: {
    label: 'Bakkerij & Overig',
    shortLabel: 'Bakkerij',
    description: 'Vers brood, banket en overige boodschappen.',
    accentText: 'text-[#3F3F46]',
    dotColor: 'bg-[#3F3F46]',
    order: 3,
  },
};

export interface Ingredient {
  id: string;
  name: string;
  amount: string;
  unit: string;
  storageCategory: StorageCategory;
}

export interface RecipeComment {
  id: string;
  recipeId: string;
  ownerId: string;
  authorName: string;
  text: string;
  createdAtMs: number;
}

export interface Recipe {
  id: string;
  ownerId: string;
  title: string;
  subtitle: string;
  story: string;
  category: RecipeCategory;
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  authorName: string;
  coverImage: string;
  extraImages: string[];
  videoUrl: string;
  videoTitle: string;
  videoLocalId: string;
  ingredients: Ingredient[];
  steps: string[];
  notes: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface SelectedRecipePlan {
  recipeId: string;
  servings: number;
}

export interface ManualShoppingItem {
  id: string;
  name: string;
  amount: string;
  unit: string;
  storageCategory: StorageCategory;
  checked: boolean;
}

export interface ShoppingListState {
  id: string;
  ownerId: string;
  title: string;
  selectedRecipes: SelectedRecipePlan[];
  checkedKeys: string[];
  manualItems: ManualShoppingItem[];
  categoryOverrides: Record<string, StorageCategory>;
}

export interface RecurringItem {
  id: string;
  ownerId: string;
  name: string;
  defaultAmount: string;
  defaultUnit: string;
  storageCategory: StorageCategory;
  averageIntervalDays: number;
  lastPurchasedAtMs: number;
  purchaseDatesMs: number[];
  notes: string;
}

export interface UserProfile {
  displayName: string;
  cookbookTitle: string;
  cookbookSubtitle: string;
  familyName: string;
  ingredientMemory: Record<string, StorageCategory>;
}

export type FamilyRole = 'admin' | 'editor' | 'viewer';
export type FamilyMemberStatus = 'active' | 'pending' | 'revoked';

export interface AdminRecord {
  uid: string;
  email: string;
  displayName: string;
  grantedBy: string;
  createdAtMs: number;
}

export interface FamilyMember {
  id: string;
  ownerId: string;
  memberName: string;
  memberEmail: string;
  role: FamilyRole;
  status: FamilyMemberStatus;
  canViewShoppingList: boolean;
  note: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface SharedRecipeSnapshot {
  id: string;
  title: string;
  subtitle: string;
  story: string;
  category: RecipeCategory;
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  authorName: string;
  coverImage: string;
  ingredients: Ingredient[];
  steps: string[];
  notes: string;
}

export interface SharedCookbook {
  id: string;
  ownerId: string;
  shareCode: string;
  cookbookTitle: string;
  cookbookSubtitle: string;
  familyName: string;
  sharedByName: string;
  isActive: boolean;
  allowCopy: boolean;
  recipeCount: number;
  recipesSnapshot: SharedRecipeSnapshot[];
  createdAtMs: number;
  updatedAtMs: number;
}

export interface CookbookPdfSettings {
  title: string;
  subtitle: string;
  familyName: string;
  includeCover: boolean;
  includeToc: boolean;
  includePhotos: boolean;
  photoOnOppositePage: boolean;
  includeComments: boolean;
  includeRegister: boolean;
  selectedRecipeIds: string[];
}

export type ActiveTab = 'kookboek' | 'boodschappen' | 'seizoen' | 'pdf' | 'beheer';

