import { useMemo, useState } from 'react';
import { Calendar, Check, Plus, Search } from 'lucide-react';
import {
  BELGIAN_SEASONAL_PRODUCE,
  DUTCH_MONTHS,
  ProduceKind,
  SeasonalProduce,
} from '../data/belgianSeasonCalendar';
import { Recipe } from '../types';

interface SeasonTrackerViewProps {
  recipes: Recipe[];
  addedItemNames: Set<string>;
  onAddProduceToShopping: (name: string) => void;
  onOpenRecipe: (recipe: Recipe) => void;
  onToggleRecipeOnShopping: (recipe: Recipe) => void;
  selectedRecipeIds: Set<string>;
}

type KindFilter = 'all' | ProduceKind | 'peak';

export function SeasonTrackerView({
  recipes,
  addedItemNames,
  onAddProduceToShopping,
  onOpenRecipe,
  onToggleRecipeOnShopping,
  selectedRecipeIds,
}: SeasonTrackerViewProps) {
  const currentMonth = new Date().getMonth() + 1;
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [search, setSearch] = useState('');

  const monthMeta = DUTCH_MONTHS[selectedMonth - 1];

  const monthlyItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return BELGIAN_SEASONAL_PRODUCE.map((item) => {
      const isPeak = item.peakMonths.includes(selectedMonth);
      const isLimited = !isPeak && item.limitedMonths.includes(selectedMonth);
      if (!isPeak && !isLimited) return null;
      if (kindFilter === 'peak' && !isPeak) return null;
      if ((kindFilter === 'groente' || kindFilter === 'fruit') && item.kind !== kindFilter) {
        return null;
      }
      if (q && !item.name.toLowerCase().includes(q) && !item.tip.toLowerCase().includes(q)) {
        return null;
      }
      return { item, intensity: isPeak ? ('top' as const) : ('beperkt' as const) };
    })
      .filter(
        (entry): entry is { item: SeasonalProduce; intensity: 'top' | 'beperkt' } =>
          entry !== null
      )
      .sort((a, b) => {
        if (a.intensity !== b.intensity) return a.intensity === 'top' ? -1 : 1;
        return a.item.name.localeCompare(b.item.name, 'nl');
      });
  }, [selectedMonth, kindFilter, search]);

  const vegetables = useMemo(
    () => monthlyItems.filter((e) => e.item.kind === 'groente'),
    [monthlyItems]
  );
  const fruits = useMemo(
    () => monthlyItems.filter((e) => e.item.kind === 'fruit'),
    [monthlyItems]
  );

  const peakCount = useMemo(
    () =>
      BELGIAN_SEASONAL_PRODUCE.filter((p) => p.peakMonths.includes(selectedMonth)).length,
    [selectedMonth]
  );

  // Match user's own cookbook recipes containing seasonal produce for the selected month
  const matchingRecipes = useMemo(() => {
    const activeSeasonal = BELGIAN_SEASONAL_PRODUCE.filter((p) =>
      p.peakMonths.includes(selectedMonth)
    );

    return recipes
      .map((recipe) => {
        const matchedProduce = new Set<string>();
        for (const ing of recipe.ingredients) {
          const lower = ing.name.toLowerCase();
          for (const prod of activeSeasonal) {
            if (prod.recipeKeywords.some((kw) => lower.includes(kw))) {
              matchedProduce.add(prod.name.split(' (')[0]);
            }
          }
        }
        return {
          recipe,
          matchedProduce: Array.from(matchedProduce),
        };
      })
      .filter((entry) => entry.matchedProduce.length > 0)
      .sort((a, b) => b.matchedProduce.length - a.matchedProduce.length);
  }, [recipes, selectedMonth]);

  const renderList = (
    title: string,
    entries: { item: SeasonalProduce; intensity: 'top' | 'beperkt' }[]
  ) => (
    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-200 flex items-baseline justify-between gap-2">
        <h2 className="font-editorial text-lg font-semibold text-zinc-950">{title}</h2>
        <span className="font-mono text-xs text-zinc-500 tabular-nums">
          {entries.length} soorten
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="p-6 text-sm text-zinc-500 text-center">
          Geen items voor dit filter in {monthMeta.full.toLowerCase()}.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {entries.map(({ item, intensity }) => {
            const cleanShortName = item.name.split(' (')[0];
            const isAdded = addedItemNames.has(cleanShortName.toLowerCase());

            return (
              <li
                key={item.id}
                className="px-4 py-2.5 flex items-start justify-between gap-3 hover:bg-zinc-50/70 transition-colors"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-semibold text-zinc-900">{item.name}</span>
                    <span aria-hidden="true" className="text-zinc-300 text-xs">
                      ·
                    </span>
                    <span
                      className={`text-[11px] font-medium ${
                        intensity === 'top' ? 'text-[#14532D]' : 'text-[#92400E]'
                      }`}
                    >
                      {intensity === 'top' ? 'Volop in seizoen' : 'Bewaarseizoen / beperkt'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 leading-5">{item.tip}</p>
                </div>

                <button
                  type="button"
                  onClick={() => onAddProduceToShopping(cleanShortName)}
                  disabled={isAdded}
                  className={`mt-0.5 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isAdded
                      ? 'bg-zinc-100 text-[#14532D]'
                      : 'bg-zinc-100 text-zinc-800 hover:bg-[#14532D] hover:text-white'
                  }`}
                >
                  {isAdded ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                  {isAdded ? 'Op lijst' : 'Lijst'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-zinc-200">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-[#14532D]">
            Seizoenskalender België &amp; West-Europa · {monthMeta.season}
          </p>
          <h1 className="font-editorial text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-950">
            Groenten &amp; fruit in {monthMeta.full.toLowerCase()}
          </h1>
          <p className="text-sm text-zinc-600 max-w-2xl">
            Bekijk wat nu lokaal in seizoen is in België en West-Europa, zet verse seizoensproducten met één klik op je boodschappenlijst en ontdek passende familierecepten.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-zinc-500 tabular-nums shrink-0">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-[#14532D]" />
            {peakCount} volop in seizoen
          </span>
          {selectedMonth !== currentMonth && (
            <button
              type="button"
              onClick={() => setSelectedMonth(currentMonth)}
              className="text-[#14532D] font-medium hover:underline whitespace-nowrap"
            >
              Terug naar vandaag ({DUTCH_MONTHS[currentMonth - 1].short})
            </button>
          )}
        </div>
      </div>

      {/* 12-Month Selector Bar */}
      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-1.5 p-1.5 bg-white border border-zinc-200 rounded-xl">
        {DUTCH_MONTHS.map((m) => {
          const isActive = m.num === selectedMonth;
          const isCurrent = m.num === currentMonth;
          return (
            <button
              key={m.num}
              type="button"
              onClick={() => setSelectedMonth(m.num)}
              className={`py-2 px-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-[#14532D] text-white'
                  : isCurrent
                    ? 'bg-zinc-100 text-zinc-950 hover:bg-zinc-200'
                    : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950'
              }`}
            >
              {m.short}
              {isCurrent && !isActive ? ' ·' : ''}
            </button>
          );
        })}
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-zinc-100 rounded-lg self-start">
          {(
            [
              { id: 'all', label: 'Alles' },
              { id: 'peak', label: 'Volop in seizoen' },
              { id: 'groente', label: 'Groenten' },
              { id: 'fruit', label: 'Fruit' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setKindFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                kindFilter === tab.id
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek groente of fruit..."
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
          />
        </div>
      </div>

      {/* Two-Column Seasonal Produce Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {(kindFilter === 'all' || kindFilter === 'peak' || kindFilter === 'groente') &&
          renderList(`Groenten in ${monthMeta.full.toLowerCase()}`, vegetables)}
        {(kindFilter === 'all' || kindFilter === 'peak' || kindFilter === 'fruit') &&
          renderList(`Fruit in ${monthMeta.full.toLowerCase()}`, fruits)}
      </div>

      {/* Matching Recipes from the Family Cookbook */}
      <section className="pt-4 border-t border-zinc-200 space-y-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-editorial text-xl font-semibold text-zinc-950">
            Passende recepten uit jullie kookboek voor {monthMeta.full.toLowerCase()}
          </h2>
          <span className="text-xs text-zinc-500 tabular-nums">
            {matchingRecipes.length} {matchingRecipes.length === 1 ? 'recept' : 'recepten'}
          </span>
        </div>

        {matchingRecipes.length === 0 ? (
          <p className="text-sm text-zinc-500 bg-white border border-zinc-200 rounded-xl p-6">
            Geen recepten in jullie kookboek bevatten directe seizoensproducten voor{' '}
            {monthMeta.full.toLowerCase()}.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {matchingRecipes.map(({ recipe, matchedProduce }) => {
              const onList = selectedRecipeIds.has(recipe.id);
              return (
                <div
                  key={recipe.id}
                  className="bg-white border border-zinc-200 rounded-xl p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="text-xs text-[#14532D] font-medium">
                      In seizoen: {matchedProduce.join(', ')}
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenRecipe(recipe)}
                      className="font-editorial text-lg font-semibold text-zinc-950 hover:text-[#14532D] text-left transition-colors cursor-pointer"
                    >
                      {recipe.title}
                    </button>
                    <p className="text-xs text-zinc-500">
                      {recipe.category} · Door {recipe.authorName}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-100">
                    <button
                      type="button"
                      onClick={() => onOpenRecipe(recipe)}
                      className="text-xs font-medium text-zinc-600 hover:text-zinc-950 transition-colors cursor-pointer"
                    >
                      Bekijk recept
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleRecipeOnShopping(recipe)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        onList
                          ? 'bg-[#14532D] text-white'
                          : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
                      }`}
                    >
                      {onList ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                      {onList ? 'Op lijst' : 'Boodschappen'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
