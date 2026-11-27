import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  CalendarPlus,
  Check,
  Copy,
  FileDown,
  History,
  Minus,
  Plus,
  RefreshCw,
  Search,
  ShoppingBasket,
  Trash2,
} from 'lucide-react';
import {
  ManualShoppingItem,
  Recipe,
  RecurringItem,
  STORAGE_CATEGORY_META,
  ShoppingListState,
  StorageCategory,
} from '../types';
import {
  buildAggregatedShoppingList,
  getRecurringItemStatus,
  guessStorageCategory,
  normalizeIngredientKey,
} from '../utils/ingredientCategorizer';
import { generateShoppingListPdf } from '../utils/pdfCookbook';

interface ShoppingListViewProps {
  recipes: Recipe[];
  shoppingState: ShoppingListState;
  ingredientMemory: Record<string, StorageCategory>;
  recurringItems: RecurringItem[];
  onUpdateShoppingState: (updater: (prev: ShoppingListState) => ShoppingListState) => void;
  onRememberIngredientCategory: (ingredientName: string, category: StorageCategory) => Promise<void>;
  onAddRecurringItem: (data: Omit<RecurringItem, 'id' | 'ownerId'>) => Promise<void>;
  onLogRecurringPurchase: (item: RecurringItem, purchaseDateMs: number) => Promise<void>;
  onDeleteRecurringItem: (itemId: string) => Promise<void>;
  onOpenRecipe: (recipe: Recipe) => void;
}

type ListFilter = 'all' | 'todo' | 'done';
type ShoppingSubTab = 'lijst' | 'cyclus';

function formatShortDate(ms: number): string {
  try {
    return new Intl.DateTimeFormat('nl-BE', {
      day: '2-digit',
      month: 'short',
    }).format(new Date(ms));
  } catch {
    return '–';
  }
}

function toDateInputValue(ms: number): string {
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function ShoppingListView({
  recipes,
  shoppingState,
  ingredientMemory,
  recurringItems,
  onUpdateShoppingState,
  onRememberIngredientCategory,
  onAddRecurringItem,
  onLogRecurringPurchase,
  onDeleteRecurringItem,
  onOpenRecipe,
}: ShoppingListViewProps) {
  const [subTab, setSubTab] = useState<ShoppingSubTab>('lijst');
  const [recipeSearch, setRecipeSearch] = useState('');
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);

  // Manual quick-add form
  const [manualName, setManualName] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualUnit, setManualUnit] = useState('');
  const [manualCat, setManualCat] = useState<StorageCategory>('vers');
  const [manualCatTouched, setManualCatTouched] = useState(false);

  // Recurring item creation form
  const [recName, setRecName] = useState('');
  const [recAmount, setRecAmount] = useState('1');
  const [recUnit, setRecUnit] = useState('st');
  const [recCat, setRecCat] = useState<StorageCategory>('proviandkast');
  const [recInterval, setRecInterval] = useState(21);
  const [recLastDate, setRecLastDate] = useState(() =>
    toDateInputValue(Date.now() - 14 * 86_400_000)
  );
  const [recNotes, setRecNotes] = useState('');
  const [savingRecurring, setSavingRecurring] = useState(false);
  const [loggingDateForId, setLoggingDateForId] = useState<string | null>(null);
  const [customLogDate, setCustomLogDate] = useState(() => toDateInputValue(Date.now()));

  const selectedMap = useMemo(
    () => new Map(shoppingState.selectedRecipes.map((s) => [s.recipeId, s.servings])),
    [shoppingState.selectedRecipes]
  );

  const checkedSet = useMemo(() => new Set(shoppingState.checkedKeys), [shoppingState.checkedKeys]);

  const filteredRecipes = useMemo(() => {
    const q = recipeSearch.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.authorName.toLowerCase().includes(q)
    );
  }, [recipes, recipeSearch]);

  const aggregatedItems = useMemo(
    () =>
      buildAggregatedShoppingList(
        recipes,
        shoppingState.selectedRecipes,
        shoppingState.categoryOverrides,
        ingredientMemory
      ),
    [recipes, shoppingState.selectedRecipes, shoppingState.categoryOverrides, ingredientMemory]
  );

  // Compute recurring items status & auto-due items ("te checken in voorraad")
  const recurringWithStatus = useMemo(
    () =>
      recurringItems
        .map((item) => ({
          item,
          status: getRecurringItemStatus(item),
        }))
        .sort((a, b) => b.status.progressRatio - a.status.progressRatio),
    [recurringItems]
  );

  const dueRecurringItems = useMemo(
    () => recurringWithStatus.filter((entry) => entry.status.isDueToCheck),
    [recurringWithStatus]
  );

  const filterVisible = (isChecked: boolean) => {
    if (listFilter === 'todo' && isChecked) return false;
    if (listFilter === 'done' && !isChecked) return false;
    return true;
  };

  const versRecipeItems = useMemo(
    () =>
      aggregatedItems.filter(
        (i) => i.storageCategory === 'vers' && filterVisible(checkedSet.has(i.key))
      ),
    [aggregatedItems, checkedSet, listFilter]
  );
  const versManualItems = useMemo(
    () =>
      shoppingState.manualItems.filter(
        (m) => m.storageCategory === 'vers' && filterVisible(m.checked)
      ),
    [shoppingState.manualItems, listFilter]
  );

  const voorraadRecipeItems = useMemo(
    () =>
      aggregatedItems.filter(
        (i) => i.storageCategory === 'proviandkast' && filterVisible(checkedSet.has(i.key))
      ),
    [aggregatedItems, checkedSet, listFilter]
  );
  const voorraadManualItems = useMemo(
    () =>
      shoppingState.manualItems.filter(
        (m) => m.storageCategory === 'proviandkast' && filterVisible(m.checked)
      ),
    [shoppingState.manualItems, listFilter]
  );

  const extraCategories: StorageCategory[] = ['bakkerij', 'diepvries'];

  const totalRemainingVers =
    aggregatedItems.filter((i) => i.storageCategory === 'vers' && !checkedSet.has(i.key)).length +
    shoppingState.manualItems.filter((m) => m.storageCategory === 'vers' && !m.checked).length;

  const totalRemainingVoorraad =
    aggregatedItems.filter((i) => i.storageCategory === 'proviandkast' && !checkedSet.has(i.key))
      .length +
    shoppingState.manualItems.filter((m) => m.storageCategory === 'proviandkast' && !m.checked)
      .length;

  const memoryEntries = useMemo(
    () => Object.entries(ingredientMemory).sort((a, b) => a[0].localeCompare(b[0], 'nl')),
    [ingredientMemory]
  );

  const toggleRecipeSelection = (recipe: Recipe) => {
    onUpdateShoppingState((prev) => {
      const exists = prev.selectedRecipes.some((s) => s.recipeId === recipe.id);
      if (exists) {
        return {
          ...prev,
          selectedRecipes: prev.selectedRecipes.filter((s) => s.recipeId !== recipe.id),
        };
      }
      return {
        ...prev,
        selectedRecipes: [
          ...prev.selectedRecipes,
          { recipeId: recipe.id, servings: recipe.servings },
        ].slice(0, 30),
      };
    });
  };

  const adjustRecipeServings = (recipeId: string, delta: number) => {
    onUpdateShoppingState((prev) => ({
      ...prev,
      selectedRecipes: prev.selectedRecipes.map((s) =>
        s.recipeId === recipeId
          ? { ...s, servings: Math.max(1, Math.min(100, s.servings + delta)) }
          : s
      ),
    }));
  };

  const toggleCheckedKey = (key: string) => {
    onUpdateShoppingState((prev) => {
      const exists = prev.checkedKeys.includes(key);
      return {
        ...prev,
        checkedKeys: exists
          ? prev.checkedKeys.filter((k) => k !== key)
          : [...prev.checkedKeys, key].slice(0, 200),
      };
    });
  };

  // Switch item between Vers & Voorraad (or other category) AND remember user preference!
  const handleSwitchCategoryAndRemember = (
    itemKey: string,
    itemName: string,
    nextCat: StorageCategory
  ) => {
    onUpdateShoppingState((prev) => ({
      ...prev,
      categoryOverrides: {
        ...prev.categoryOverrides,
        [itemKey]: nextCat,
      },
    }));
    void onRememberIngredientCategory(itemName, nextCat);
  };

  const handleAddManualItem = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = manualName.trim().slice(0, 150);
    if (!cleanName) return;
    const item: ManualShoppingItem = {
      id: `man_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      amount: manualAmount.trim().slice(0, 40),
      unit: manualUnit.trim().slice(0, 40),
      storageCategory: manualCat,
      checked: false,
    };
    onUpdateShoppingState((prev) => ({
      ...prev,
      manualItems: [...prev.manualItems, item].slice(0, 60),
    }));
    if (manualCatTouched) {
      void onRememberIngredientCategory(cleanName, manualCat);
    }
    setManualName('');
    setManualAmount('');
    setManualUnit('');
    setManualCat('vers');
    setManualCatTouched(false);
  };

  const toggleManualChecked = (id: string) => {
    onUpdateShoppingState((prev) => ({
      ...prev,
      manualItems: prev.manualItems.map((m) =>
        m.id === id ? { ...m, checked: !m.checked } : m
      ),
    }));
  };

  const changeManualCategory = (item: ManualShoppingItem, nextCat: StorageCategory) => {
    onUpdateShoppingState((prev) => ({
      ...prev,
      manualItems: prev.manualItems.map((m) =>
        m.id === item.id ? { ...m, storageCategory: nextCat } : m
      ),
    }));
    void onRememberIngredientCategory(item.name, nextCat);
  };

  const removeManualItem = (id: string) => {
    onUpdateShoppingState((prev) => ({
      ...prev,
      manualItems: prev.manualItems.filter((m) => m.id !== id),
    }));
  };

  const handleCreateRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = recName.trim().slice(0, 150);
    if (!cleanName) return;
    const parsedMs = recLastDate ? new Date(`${recLastDate}T12:00:00`).getTime() : Date.now();
    const lastMs = Number.isFinite(parsedMs) ? parsedMs : Date.now();
    const interval = Math.max(1, Math.min(365, Number(recInterval) || 14));

    setSavingRecurring(true);
    try {
      await onAddRecurringItem({
        name: cleanName,
        defaultAmount: recAmount.trim().slice(0, 40) || '1',
        defaultUnit: recUnit.trim().slice(0, 40),
        storageCategory: recCat,
        averageIntervalDays: interval,
        lastPurchasedAtMs: lastMs,
        purchaseDatesMs: [lastMs],
        notes: recNotes.trim().slice(0, 300),
      });
      setRecName('');
      setRecAmount('1');
      setRecUnit('st');
      setRecInterval(21);
      setRecNotes('');
    } finally {
      setSavingRecurring(false);
    }
  };

  const handleCopyCompactText = async () => {
    const lines: string[] = ['BOODSCHAPPENLIJST — AAN TAFEL!', ''];

    const addSection = (header: string, entries: string[]) => {
      if (entries.length === 0) return;
      lines.push(header);
      lines.push(...entries);
      lines.push('');
    };

    const versLines = [
      ...aggregatedItems
        .filter((i) => i.storageCategory === 'vers' && !checkedSet.has(i.key))
        .map((i) => `[ ] ${i.displayAmount} ${i.name}`),
      ...shoppingState.manualItems
        .filter((m) => m.storageCategory === 'vers' && !m.checked)
        .map((m) => `[ ] ${[m.amount, m.unit].filter(Boolean).join(' ')} ${m.name}`.trim()),
    ];
    addSection('VERS TE KOPEN', versLines);

    const voorraadLines = [
      ...aggregatedItems
        .filter((i) => i.storageCategory === 'proviandkast' && !checkedSet.has(i.key))
        .map((i) => `[ ] ${i.displayAmount} ${i.name}`),
      ...shoppingState.manualItems
        .filter((m) => m.storageCategory === 'proviandkast' && !m.checked)
        .map((m) => `[ ] ${[m.amount, m.unit].filter(Boolean).join(' ')} ${m.name}`.trim()),
    ];
    addSection('IN DE VOORRAAD (NORMAAL) — CHECKEN', voorraadLines);

    const dueLines = dueRecurringItems.map(
      ({ item, status }) =>
        `[ ] ${[item.defaultAmount, item.defaultUnit].filter(Boolean).join(' ')} ${item.name} (${status.daysSinceLast}d geleden, gem. ${status.effectiveAverageDays}d)`
    );
    addSection('TERUGKEREND — TE CHECKEN IN VOORRAAD', dueLines);

    for (const cat of extraCategories) {
      const catLines = [
        ...aggregatedItems
          .filter((i) => i.storageCategory === cat && !checkedSet.has(i.key))
          .map((i) => `[ ] ${i.displayAmount} ${i.name}`),
        ...shoppingState.manualItems
          .filter((m) => m.storageCategory === cat && !m.checked)
          .map((m) => `[ ] ${[m.amount, m.unit].filter(Boolean).join(' ')} ${m.name}`.trim()),
      ];
      addSection(STORAGE_CATEGORY_META[cat].label.toUpperCase(), catLines);
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n').trim());
      setCopiedNotice(true);
      window.setTimeout(() => setCopiedNotice(false), 2400);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleExportPdf = () => {
    const selectedTitles = shoppingState.selectedRecipes
      .map((p) => recipes.find((r) => r.id === p.recipeId)?.title)
      .filter((t): t is string => Boolean(t));

    generateShoppingListPdf(
      shoppingState.title || 'Boodschappenlijst',
      selectedTitles,
      aggregatedItems,
      shoppingState.manualItems,
      checkedSet,
      dueRecurringItems.map(({ item, status }) => ({
        name: item.name,
        amount: [item.defaultAmount, item.defaultUnit].filter(Boolean).join(' ') || '1x',
        note: `${status.daysSinceLast}d geleden (gem. ${status.effectiveAverageDays}d)`,
      }))
    );
  };

  const renderCompactRow = (
    idKey: string,
    amount: string,
    name: string,
    subtext: string,
    isChecked: boolean,
    category: StorageCategory,
    onToggle: () => void,
    onFlipQuick: () => void,
    onRemove?: () => void
  ) => {
    const quickTargetLabel = category === 'vers' ? '→ Voorraad' : '→ Vers';
    return (
      <li
        key={idKey}
        className={`px-3 py-1.5 flex items-center justify-between gap-2 text-xs hover:bg-zinc-50 transition-colors ${
          isChecked ? 'opacity-50' : ''
        }`}
      >
        <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={onToggle}
            className="w-3.5 h-3.5 rounded border-zinc-300 text-[#14532D] focus:ring-[#14532D] shrink-0"
          />
          <span className="font-mono text-[11px] font-medium text-zinc-900 tabular-nums w-[74px] shrink-0 truncate">
            {amount}
          </span>
          <span
            className={`font-medium truncate ${
              isChecked ? 'line-through text-zinc-500' : 'text-zinc-900'
            }`}
          >
            {name}
          </span>
          {subtext && (
            <span className="text-[10px] text-zinc-400 truncate hidden sm:inline">
              · {subtext}
            </span>
          )}
        </label>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onFlipQuick}
            title={`Verplaats naar ${category === 'vers' ? 'Voorraad' : 'Vers'} (wordt onthouden)`}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100 rounded transition-colors whitespace-nowrap cursor-pointer"
          >
            <ArrowLeftRight className="w-2.5 h-2.5" />
            {quickTargetLabel}
          </button>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="p-1 text-zinc-400 hover:text-red-600 rounded transition-colors cursor-pointer"
              aria-label={`${name} verwijderen`}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      {/* Compact Header & Sub-Navigation */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-200">
        <div className="space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-editorial text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950">
              Boodschappenlijst
            </h1>
            <span className="text-xs text-zinc-500 tabular-nums">
              {shoppingState.selectedRecipes.length} recepten · {totalRemainingVers} vers ·{' '}
              {totalRemainingVoorraad} voorraad · {dueRecurringItems.length} terugkerend te checken
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Sub-View Switcher */}
          <div className="inline-flex items-center gap-1 p-1 bg-zinc-100 rounded-lg">
            <button
              type="button"
              onClick={() => setSubTab('lijst')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                subTab === 'lijst'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Compact lijstje
            </button>
            <button
              type="button"
              onClick={() => setSubTab('cyclus')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                subTab === 'cyclus'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <RefreshCw className="w-3 h-3" />
              Vaste boodschappen ({recurringItems.length})
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopyCompactText}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-800 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            {copiedNotice ? <Check className="w-3.5 h-3.5 text-[#14532D]" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedNotice ? 'Gekopieerd' : 'Kopieer'}
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5" />
            Print / PDF (1 pag.)
          </button>
        </div>
      </div>

      {subTab === 'lijst' ? (
        <div className="space-y-5">
          {/* Compact Recipe Picker Strip */}
          <section className="bg-white border border-zinc-200 rounded-xl p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-900">
                  1. Recepten voor deze boodschappen
                </span>
                <span className="text-[11px] text-zinc-400">
                  (dubbele ingrediënten worden automatisch samengevoegd)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative w-48">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={recipeSearch}
                    onChange={(e) => setRecipeSearch(e.target.value)}
                    placeholder="Filter recept..."
                    className="w-full pl-8 pr-2.5 py-1 text-xs bg-zinc-50 border border-zinc-200 rounded-md focus:outline-none focus:bg-white focus:border-[#14532D]"
                  />
                </div>
                {shoppingState.selectedRecipes.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateShoppingState((prev) => ({
                        ...prev,
                        selectedRecipes: [],
                        checkedKeys: [],
                      }))
                    }
                    className="text-[11px] text-zinc-500 hover:text-zinc-900 whitespace-nowrap cursor-pointer"
                  >
                    Selectie wissen
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {filteredRecipes.map((recipe) => {
                const plannedServings = selectedMap.get(recipe.id);
                const isSelected = plannedServings !== undefined;

                return (
                  <div
                    key={recipe.id}
                    className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border transition-colors ${
                      isSelected
                        ? 'bg-[#14532D]/[0.04] border-[#14532D]/40'
                        : 'bg-zinc-50/50 border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleRecipeSelection(recipe)}
                      className="flex items-center gap-2 min-w-0 text-left flex-1 cursor-pointer"
                    >
                      <span
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-[#14532D] border-[#14532D] text-white'
                            : 'bg-white border-zinc-300'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3" strokeWidth={2.5} />}
                      </span>
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-zinc-900 block truncate">
                          {recipe.title}
                        </span>
                        <span className="text-[10px] text-zinc-500 block truncate">
                          {recipe.ingredients.length} ingr. ·{' '}
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenRecipe(recipe);
                            }}
                            className="underline hover:text-zinc-900"
                          >
                            open
                          </span>
                        </span>
                      </div>
                    </button>

                    {isSelected && (
                      <div className="inline-flex items-center gap-0.5 bg-white border border-zinc-200 rounded-md p-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => adjustRecipeServings(recipe.id, -1)}
                          className="w-5 h-5 flex items-center justify-center text-zinc-600 hover:bg-zinc-100 rounded cursor-pointer"
                          aria-label="Minder personen"
                        >
                          <Minus className="w-2.5 h-2.5" />
                        </button>
                        <span className="px-1 text-[11px] font-mono font-medium tabular-nums">
                          {plannedServings}p
                        </span>
                        <button
                          type="button"
                          onClick={() => adjustRecipeServings(recipe.id, 1)}
                          className="w-5 h-5 flex items-center justify-center text-zinc-600 hover:bg-zinc-100 rounded cursor-pointer"
                          aria-label="Meer personen"
                        >
                          <Plus className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Compact Filter + Quick Add + Memory Bar */}
          <div className="bg-white border border-zinc-200 rounded-xl p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <form onSubmit={handleAddManualItem} className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 flex-1">
              <input
                type="text"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                maxLength={40}
                placeholder="1"
                aria-label="Aantal"
                className="w-14 px-2 py-1.5 text-xs font-mono tabular-nums bg-zinc-50 border border-zinc-200 rounded-md focus:outline-none focus:bg-white focus:border-[#14532D]"
              />
              <input
                type="text"
                value={manualUnit}
                onChange={(e) => setManualUnit(e.target.value)}
                maxLength={40}
                placeholder="st / g"
                aria-label="Eenheid"
                className="w-16 px-2 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-md focus:outline-none focus:bg-white focus:border-[#14532D]"
              />
              <input
                type="text"
                value={manualName}
                onChange={(e) => {
                  const val = e.target.value;
                  setManualName(val);
                  if (!manualCatTouched) {
                    setManualCat(guessStorageCategory(val, ingredientMemory));
                  }
                }}
                maxLength={150}
                placeholder="Los item toevoegen (bijv. appelen, boter, confituur)..."
                aria-label="Extra boodschap"
                className="flex-1 min-w-[160px] px-2.5 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-md focus:outline-none focus:bg-white focus:border-[#14532D]"
              />
              <select
                value={manualCat}
                onChange={(e) => {
                  setManualCat(e.target.value as StorageCategory);
                  setManualCatTouched(true);
                }}
                aria-label="Categorie"
                className="px-2 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-md focus:outline-none focus:border-[#14532D]"
              >
                <option value="vers">Vers</option>
                <option value="proviandkast">Voorraad</option>
                <option value="bakkerij">Bakkerij</option>
                <option value="diepvries">Diepvries</option>
              </select>
              <button
                type="submit"
                disabled={!manualName.trim()}
                className="px-3 py-1.5 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-md transition-colors whitespace-nowrap disabled:opacity-40 cursor-pointer"
              >
                + Toevoegen
              </button>
            </form>

            <div className="flex items-center justify-between lg:justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowMemoryPanel((v) => !v)}
                className="text-[11px] text-zinc-500 hover:text-zinc-900 underline underline-offset-2 whitespace-nowrap cursor-pointer"
              >
                Geheugen ({memoryEntries.length})
              </button>

              <div className="inline-flex items-center gap-0.5 p-0.5 bg-zinc-100 rounded-md">
                {(
                  [
                    { id: 'all', label: 'Alles' },
                    { id: 'todo', label: 'Nodig' },
                    { id: 'done', label: 'Gecheckt' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setListFilter(tab.id)}
                    className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                      listFilter === tab.id
                        ? 'bg-white text-zinc-950 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Optional Compact Memory Drawer showing learned Vers / Voorraad preferences */}
          {showMemoryPanel && (
            <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-zinc-900">
                  Onthouden ingrediënt-indelingen (Vers vs. Voorraad)
                </p>
                <span className="text-[11px] text-zinc-500">
                  Klik op &ldquo;→ Vers / → Voorraad&rdquo; bij een item om je voorkeur permanent aan te passen
                </span>
              </div>
              {memoryEntries.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  Nog geen persoonlijke overschrijvingen opgeslagen. Zodra je een ingrediënt verplaatst tussen Vers en Voorraad, onthoudt Aan Tafel! jouw keuze voortaan automatisch.
                </p>
              ) : (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                  {memoryEntries.map(([key, cat]) => (
                    <span key={key} className="inline-flex items-center gap-1.5 text-zinc-700">
                      <span className="font-medium capitalize">{key}</span>
                      <span className="text-zinc-400">→</span>
                      <button
                        type="button"
                        onClick={() =>
                          onRememberIngredientCategory(
                            key,
                            cat === 'vers' ? 'proviandkast' : 'vers'
                          )
                        }
                        className={`font-medium underline cursor-pointer ${STORAGE_CATEGORY_META[cat].accentText}`}
                      >
                        {STORAGE_CATEGORY_META[cat].shortLabel}
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* COMPACT TWO-COLUMN GROCERY SHEET (High Density — Fits on One Page) */}
          {aggregatedItems.length === 0 &&
          shoppingState.manualItems.length === 0 &&
          dueRecurringItems.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-xl p-10 text-center space-y-2">
              <ShoppingBasket className="w-7 h-7 text-zinc-300 mx-auto" strokeWidth={1.5} />
              <p className="font-editorial text-lg font-semibold text-zinc-900">
                Selecteer recepten of voeg vaste boodschappen toe
              </p>
              <p className="text-xs text-zinc-500 max-w-md mx-auto">
                Vink hierboven gerechten aan om je compacte boodschappenlijst te genereren.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              {/* LEFT COLUMN: VERS TE KOPEN + Bakkerij & Diepvries */}
              <div className="space-y-4">
                <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                  <div className="px-3.5 py-2.5 bg-[#14532D]/[0.04] border-b border-zinc-200 flex items-baseline justify-between gap-2">
                    <div>
                      <h2 className="font-editorial text-base font-semibold text-[#14532D]">
                        Vers te kopen
                      </h2>
                      <p className="text-[11px] text-zinc-500">
                        Groente, fruit, vlees, vis &amp; zuivel
                      </p>
                    </div>
                    <span className="font-mono text-xs text-zinc-500 tabular-nums">
                      {versRecipeItems.length + versManualItems.length}
                    </span>
                  </div>

                  {versRecipeItems.length === 0 && versManualItems.length === 0 ? (
                    <p className="px-3.5 py-4 text-xs text-zinc-400">
                      Geen verse producten op dit moment.
                    </p>
                  ) : (
                    <ul className="divide-y divide-zinc-100">
                      {versRecipeItems.map((item) =>
                        renderCompactRow(
                          item.key,
                          item.displayAmount,
                          item.name,
                          item.sources.length > 1
                            ? `${item.sources.length} recepten samengevoegd`
                            : item.sources[0]?.recipeTitle || '',
                          checkedSet.has(item.key),
                          'vers',
                          () => toggleCheckedKey(item.key),
                          () => handleSwitchCategoryAndRemember(item.key, item.name, 'proviandkast')
                        )
                      )}
                      {versManualItems.map((item) =>
                        renderCompactRow(
                          item.id,
                          [item.amount, item.unit].filter(Boolean).join(' ') || '1x',
                          item.name,
                          'los',
                          item.checked,
                          'vers',
                          () => toggleManualChecked(item.id),
                          () => changeManualCategory(item, 'proviandkast'),
                          () => removeManualItem(item.id)
                        )
                      )}
                    </ul>
                  )}
                </div>

                {/* Bakkerij & Diepvries (compact blocks when populated) */}
                {extraCategories.map((cat) => {
                  const recItems = aggregatedItems.filter(
                    (i) => i.storageCategory === cat && filterVisible(checkedSet.has(i.key))
                  );
                  const manItems = shoppingState.manualItems.filter(
                    (m) => m.storageCategory === cat && filterVisible(m.checked)
                  );
                  if (recItems.length === 0 && manItems.length === 0) return null;
                  const meta = STORAGE_CATEGORY_META[cat];

                  return (
                    <div
                      key={cat}
                      className="bg-white border border-zinc-200 rounded-xl overflow-hidden"
                    >
                      <div className="px-3.5 py-2 bg-zinc-50 border-b border-zinc-200 flex items-baseline justify-between gap-2">
                        <h3 className={`font-editorial text-sm font-semibold ${meta.accentText}`}>
                          {meta.label}
                        </h3>
                        <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
                          {recItems.length + manItems.length}
                        </span>
                      </div>
                      <ul className="divide-y divide-zinc-100">
                        {recItems.map((item) =>
                          renderCompactRow(
                            item.key,
                            item.displayAmount,
                            item.name,
                            item.sources.length > 1
                              ? `${item.sources.length} recepten`
                              : item.sources[0]?.recipeTitle || '',
                            checkedSet.has(item.key),
                            cat,
                            () => toggleCheckedKey(item.key),
                            () => handleSwitchCategoryAndRemember(item.key, item.name, 'vers')
                          )
                        )}
                        {manItems.map((item) =>
                          renderCompactRow(
                            item.id,
                            [item.amount, item.unit].filter(Boolean).join(' ') || '1x',
                            item.name,
                            'los',
                            item.checked,
                            cat,
                            () => toggleManualChecked(item.id),
                            () => changeManualCategory(item, 'vers'),
                            () => removeManualItem(item.id)
                          )
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>

              {/* RIGHT COLUMN: IN DE VOORRAAD (NORMAAL) - CHECKEN + TERUGKEREND (TE CHECKEN) */}
              <div className="space-y-4">
                <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                  <div className="px-3.5 py-2.5 bg-amber-50/50 border-b border-zinc-200 flex items-baseline justify-between gap-2">
                    <div>
                      <h2 className="font-editorial text-base font-semibold text-[#92400E]">
                        In de voorraad (normaal) — checken
                      </h2>
                      <p className="text-[11px] text-zinc-500">
                        Proviandkast &amp; kruiden voor je recepten — vink af wat je nog hebt
                      </p>
                    </div>
                    <span className="font-mono text-xs text-zinc-500 tabular-nums">
                      {voorraadRecipeItems.length + voorraadManualItems.length}
                    </span>
                  </div>

                  {voorraadRecipeItems.length === 0 && voorraadManualItems.length === 0 ? (
                    <p className="px-3.5 py-4 text-xs text-zinc-400">
                      Geen voorraad-ingrediënten voor deze selectie.
                    </p>
                  ) : (
                    <ul className="divide-y divide-zinc-100">
                      {voorraadRecipeItems.map((item) =>
                        renderCompactRow(
                          item.key,
                          item.displayAmount,
                          item.name,
                          item.sources.length > 1
                            ? `${item.sources.length} recepten samengevoegd`
                            : item.sources[0]?.recipeTitle || '',
                          checkedSet.has(item.key),
                          'proviandkast',
                          () => toggleCheckedKey(item.key),
                          () => handleSwitchCategoryAndRemember(item.key, item.name, 'vers')
                        )
                      )}
                      {voorraadManualItems.map((item) =>
                        renderCompactRow(
                          item.id,
                          [item.amount, item.unit].filter(Boolean).join(' ') || '1x',
                          item.name,
                          'los',
                          item.checked,
                          'proviandkast',
                          () => toggleManualChecked(item.id),
                          () => changeManualCategory(item, 'vers'),
                          () => removeManualItem(item.id)
                        )
                      )}
                    </ul>
                  )}
                </div>

                {/* AUTOMATIC RECURRING STAPLES DUE FOR CHECK */}
                <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                  <div className="px-3.5 py-2.5 bg-zinc-50 border-b border-zinc-200 flex items-baseline justify-between gap-2">
                    <div>
                      <h2 className="font-editorial text-base font-semibold text-zinc-950">
                        Te checken in voorraad (vaste cyclus)
                      </h2>
                      <p className="text-[11px] text-zinc-500">
                        Automatisch toegevoegd rond je gemiddelde aankooptijd
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSubTab('cyclus')}
                      className="text-[11px] font-medium text-[#14532D] hover:underline whitespace-nowrap cursor-pointer"
                    >
                      Beheer cyclus
                    </button>
                  </div>

                  {dueRecurringItems.length === 0 ? (
                    <p className="px-3.5 py-4 text-xs text-zinc-500">
                      Alle vaste boodschappen (zoals confituur en koffie) zitten nog ruim binnen hun gemiddelde cyclus.
                    </p>
                  ) : (
                    <ul className="divide-y divide-zinc-100">
                      {dueRecurringItems.map(({ item, status }) => {
                        const qty =
                          [item.defaultAmount, item.defaultUnit].filter(Boolean).join(' ') || '1x';
                        return (
                          <li
                            key={item.id}
                            className="px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-zinc-50 transition-colors"
                          >
                            <div className="min-w-0 flex items-center gap-2.5 flex-1">
                              <span className="font-mono text-[11px] font-medium text-zinc-900 tabular-nums w-[56px] shrink-0 truncate">
                                {qty}
                              </span>
                              <div className="min-w-0">
                                <span className="font-semibold text-zinc-900 block truncate">
                                  {item.name}
                                </span>
                                <span className="text-[10px] text-[#92400E] tabular-nums block">
                                  {status.daysSinceLast} d geleden gekocht · gem. elke{' '}
                                  {status.effectiveAverageDays} d
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => void onLogRecurringPurchase(item, Date.now())}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                              Gekocht
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* SUB-TAB 2: RECURRING STAPLES & PURCHASE FREQUENCY TRACKER */
        <div className="space-y-6">
          <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
            <div className="space-y-1">
              <h2 className="font-editorial text-xl font-semibold text-zinc-950">
                Terugkerend product toevoegen
              </h2>
              <p className="text-xs text-zinc-600">
                Voeg producten toe die je regelmatig opnieuw koopt (zoals confituur, koffie, olijfolie of melk). Elke keer dat je een aankoop logt, berekent Aan Tafel! automatisch het echte gemiddelde in dagen en zet het product op tijd bij &ldquo;Te checken in voorraad&rdquo;.
              </p>
            </div>

            <form onSubmit={handleCreateRecurring} className="grid grid-cols-12 gap-3 items-end">
              <div className="col-span-12 sm:col-span-4">
                <label htmlFor="rec-item-name" className="block text-xs font-medium text-zinc-700 mb-1">
                  Productnaam *
                </label>
                <input
                  id="rec-item-name"
                  type="text"
                  required
                  maxLength={150}
                  value={recName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRecName(val);
                    setRecCat(guessStorageCategory(val, ingredientMemory));
                  }}
                  placeholder="Bijv. Confituur (aardbei)"
                  className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                />
              </div>

              <div className="col-span-4 sm:col-span-1">
                <label htmlFor="rec-item-amt" className="block text-xs font-medium text-zinc-700 mb-1">
                  Aantal
                </label>
                <input
                  id="rec-item-amt"
                  type="text"
                  maxLength={40}
                  value={recAmount}
                  onChange={(e) => setRecAmount(e.target.value)}
                  className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                />
              </div>

              <div className="col-span-4 sm:col-span-1">
                <label htmlFor="rec-item-unit" className="block text-xs font-medium text-zinc-700 mb-1">
                  Eenheid
                </label>
                <input
                  id="rec-item-unit"
                  type="text"
                  maxLength={40}
                  value={recUnit}
                  onChange={(e) => setRecUnit(e.target.value)}
                  placeholder="pot"
                  className="w-full px-2.5 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                />
              </div>

              <div className="col-span-4 sm:col-span-2">
                <label htmlFor="rec-item-days" className="block text-xs font-medium text-zinc-700 mb-1">
                  Gem. elke (dagen)
                </label>
                <input
                  id="rec-item-days"
                  type="number"
                  min={1}
                  max={365}
                  value={recInterval}
                  onChange={(e) => setRecInterval(Number(e.target.value))}
                  className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                />
              </div>

              <div className="col-span-6 sm:col-span-2">
                <label htmlFor="rec-item-date" className="block text-xs font-medium text-zinc-700 mb-1">
                  Laatst gekocht op
                </label>
                <input
                  id="rec-item-date"
                  type="date"
                  value={recLastDate}
                  onChange={(e) => setRecLastDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs font-mono bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                />
              </div>

              <div className="col-span-6 sm:col-span-2">
                <button
                  type="submit"
                  disabled={savingRecurring || !recName.trim()}
                  className="w-full px-3.5 py-2 text-xs font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 cursor-pointer"
                >
                  {savingRecurring ? 'Opslaan...' : '+ Toevoegen'}
                </button>
              </div>
            </form>
          </div>

          {/* Recurring Purchase Cycle Table */}
          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#14532D]" />
                <h2 className="font-editorial text-lg font-semibold text-zinc-950">
                  Overzicht aankoopcyclus ({recurringWithStatus.length})
                </h2>
              </div>
              <span className="text-xs text-zinc-500">
                Automatische melding vanaf 85% van het gemiddelde interval
              </span>
            </div>

            {recurringWithStatus.length === 0 ? (
              <p className="p-8 text-sm text-zinc-500 text-center">
                Nog geen vaste boodschappen toegevoegd. Voeg hierboven bijvoorbeeld confituur of koffie toe.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 text-[11px] font-semibold text-zinc-500 bg-zinc-50/50">
                      <th className="py-2.5 px-4">Product</th>
                      <th className="py-2.5 px-3">Laatst gekocht</th>
                      <th className="py-2.5 px-3 text-right">Geleden</th>
                      <th className="py-2.5 px-3 text-right">Gemiddelde</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-4 text-right">Acties</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 text-xs">
                    {recurringWithStatus.map(({ item, status }) => {
                      const pct = Math.min(100, Math.round(status.progressRatio * 100));
                      return (
                        <tr key={item.id} className="hover:bg-zinc-50/70 transition-colors">
                          <td className="py-2.5 px-4">
                            <span className="font-semibold text-zinc-900 block">
                              {item.name}
                            </span>
                            <span className="text-[11px] text-zinc-500">
                              {[item.defaultAmount, item.defaultUnit].filter(Boolean).join(' ')} ·{' '}
                              {item.purchaseDatesMs.length} aankopen gelogd
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-zinc-600 tabular-nums whitespace-nowrap">
                            {formatShortDate(item.lastPurchasedAtMs)}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-medium text-zinc-900 text-right tabular-nums whitespace-nowrap">
                            {status.daysSinceLast} d
                          </td>
                          <td className="py-2.5 px-3 font-mono text-zinc-700 text-right tabular-nums whitespace-nowrap">
                            {status.effectiveAverageDays} d
                          </td>
                          <td className="py-2.5 px-3 min-w-[160px]">
                            <div className="space-y-1">
                              <span
                                className={`text-[11px] font-medium block ${
                                  status.isDueToCheck ? 'text-[#92400E]' : 'text-[#14532D]'
                                }`}
                              >
                                {status.isDueToCheck
                                  ? 'Te checken in voorraad'
                                  : `Nog ~${Math.max(1, status.daysUntilAverage)} dagen`}
                              </span>
                              <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    status.isDueToCheck ? 'bg-amber-600' : 'bg-[#14532D]'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {loggingDateForId === item.id ? (
                                <div className="inline-flex items-center gap-1">
                                  <input
                                    type="date"
                                    value={customLogDate}
                                    onChange={(e) => setCustomLogDate(e.target.value)}
                                    className="px-1.5 py-1 text-[11px] font-mono border border-zinc-200 rounded"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const ms = new Date(`${customLogDate}T12:00:00`).getTime();
                                      if (Number.isFinite(ms)) {
                                        void onLogRecurringPurchase(item, ms);
                                      }
                                      setLoggingDateForId(null);
                                    }}
                                    className="px-2 py-1 text-[11px] font-medium text-white bg-[#14532D] rounded cursor-pointer"
                                  >
                                    OK
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setLoggingDateForId(null)}
                                    className="px-1.5 py-1 text-[11px] text-zinc-500 cursor-pointer"
                                  >
                                    ×
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void onLogRecurringPurchase(item, Date.now())}
                                    className="px-2.5 py-1 text-[11px] font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-md transition-colors cursor-pointer"
                                  >
                                    Vandaag gekocht
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setLoggingDateForId(item.id);
                                      setCustomLogDate(toDateInputValue(Date.now() - 14 * 86_400_000));
                                    }}
                                    title="Eerdere aankoopdatum toevoegen voor gemiddelde berekening"
                                    className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-md transition-colors cursor-pointer"
                                    aria-label="Eerdere datum loggen"
                                  >
                                    <CalendarPlus className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void onDeleteRecurringItem(item.id)}
                                    className="p-1.5 text-zinc-400 hover:text-red-600 rounded-md transition-colors cursor-pointer"
                                    aria-label={`${item.name} verwijderen`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Keep normalizeIngredientKey imported cleanly for future extensions
void normalizeIngredientKey;
