import { Recipe, RecurringItem, SelectedRecipePlan, StorageCategory } from '../types';

const DIEPVRIES_KEYWORDS = [
  'diepvries',
  'bevroren',
  'bladerdeeg',
  'roomijs',
  'ijs',
  'doperwten (diepvries)',
  'tuinerwten',
  'spinazie a la creme',
  'friet',
  'kroket',
  'sorbet',
];

const BAKKERIJ_KEYWORDS = [
  'brood',
  'stokbrood',
  'zuurdesem',
  'ciabatta',
  'pistolet',
  'croissant',
  'peperkoek',
  'ontbijtkoek',
  'brioche',
  'beschuit',
  'bagel',
  'focaccia',
  'wrap',
  'tortilla',
  'pita',
  'tostibrood',
];

const PROVIANDKAST_KEYWORDS = [
  'olie',
  'olijfolie',
  'zonnebloemolie',
  'azijn',
  'balsamico',
  'zout',
  'zeezout',
  'peper',
  'zwarte peper',
  'kaneel',
  'nootmuskaat',
  'paprikapoeder',
  'komijn',
  'kurkuma',
  'kerrie',
  'laurier',
  'kruidnagel',
  'oregano',
  'gedroogde',
  'bloem',
  'meel',
  'zelfrijzend',
  'suiker',
  'basterdsuiker',
  'poedersuiker',
  'vanillesuiker',
  'honing',
  'stroop',
  'luikse stroop',
  'appelstroop',
  'jam',
  'confituur',
  'choco',
  'pindakaas',
  'pasta',
  'spaghetti',
  'penne',
  'tagliatelle',
  'lasagne',
  'rijst',
  'risottorijst',
  'arborio',
  'carnaroli',
  'couscous',
  'quinoa',
  'bulgur',
  'havermout',
  'granola',
  'paneermeel',
  'panko',
  'maizena',
  'bakpoeder',
  'baksoda',
  'gist',
  'bouillon',
  'fond',
  'tomatenpuree',
  'passata',
  'gepelde tomaten',
  'blik',
  'kokosmelk',
  'sojasaus',
  'ketjap',
  'mosterd',
  'mayonaise',
  'ketchup',
  'worcestershire',
  'tabasco',
  'pesto',
  'kappertjes',
  'olijven',
  'augurk',
  'rozijnen',
  'krenten',
  'noten',
  'walnoten',
  'amandelen',
  'pijnboompitten',
  'pompoenpitten',
  'sesamzaad',
  'linzen',
  'kikkererwten',
  'bonen',
  'chocolade',
  'cacao',
  'bier',
  'trappist',
  'bruin bier',
  'wijn',
  'witte wijn',
  'rode wijn',
  'sherry',
  'rum',
  'koffie',
  'koffiebonen',
  'thee',
];

const VERS_KEYWORDS = [
  'ui',
  'uien',
  'sjalot',
  'knoflook',
  'prei',
  'wortel',
  'selder',
  'bleekselderij',
  'paprika',
  'tomaat',
  'tomaten',
  'komkommer',
  'courgette',
  'aubergine',
  'pompoen',
  'aardappel',
  'zoete aardappel',
  'spinazie',
  'rucola',
  'sla',
  'witlof',
  'witloof',
  'broccoli',
  'bloemkool',
  'spruitjes',
  'champignon',
  'paddenstoel',
  'cantharel',
  'oesterzwam',
  'gember',
  'chilipeper',
  'rode peper',
  'citroen',
  'limoen',
  'sinaasappel',
  'appel',
  'appels',
  'peer',
  'peren',
  'banaan',
  'aardbei',
  'framboos',
  'bosbes',
  'avocado',
  'peterselie',
  'tijm',
  'rozemarijn',
  'salie',
  'basilicum',
  'koriander',
  'bieslook',
  'munt',
  'dille',
  'rund',
  'stoofvlees',
  'runderlappen',
  'gehakt',
  'kip',
  'kipfilet',
  'kippendij',
  'varken',
  'spek',
  'spekblokjes',
  'ham',
  'worst',
  'lam',
  'zalm',
  'kabeljauw',
  'garnaal',
  'garnalen',
  'mosselen',
  'tonijnfilet',
  'boter',
  'roomboter',
  'melk',
  'karnemelk',
  'room',
  'slagroom',
  'kookroom',
  'creme fraiche',
  'crème fraîche',
  'yoghurt',
  'kwark',
  'kaas',
  'parmezaan',
  'parmigiano',
  'mozzarella',
  'ricotta',
  'mascarpone',
  'feta',
  'geitenkaas',
  'ei',
  'eieren',
  'eidooier',
  'tofu',
  'tempeh',
];

const DUTCH_SINGULAR_MAP: Record<string, string> = {
  uien: 'ui',
  ajuin: 'ui',
  ajuinen: 'ui',
  sjalotten: 'sjalot',
  eieren: 'ei',
  tomaten: 'tomaat',
  wortels: 'wortel',
  wortelen: 'wortel',
  aardappelen: 'aardappel',
  aardappels: 'aardappel',
  appels: 'appel',
  appelen: 'appel',
  peren: 'peer',
  citroenen: 'citroen',
  limoenen: 'limoen',
  bananen: 'banaan',
  courgettes: 'courgette',
  aubergines: 'aubergine',
  komkommers: 'komkommer',
  preien: 'prei',
  champignons: 'champignon',
  paddenstoelen: 'paddenstoel',
  spruiten: 'spruitjes',
  laurierblaadjes: 'laurierblad',
  knoflooktenen: 'knoflook',
  knoflookteentjes: 'knoflook',
  'paprika\'s': 'paprika',
  paprikas: 'paprika',
};

export function normalizeIngredientKey(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, '') // strip parenthetical hints like "(ongezouten)" for better merging
    .replace(/\s+/g, ' ')
    .replace(
      /^(verse|vers|fijngehakte|gesnipperde|geraspte|ongezouten|koude|grote|kleine|rijpe|biologische|extra vierge)\s+/g,
      ''
    )
    .replace(
      /^(verse|vers|fijngehakte|gesnipperde|geraspte|ongezouten|koude|grote|kleine|rijpe)\s+/g,
      ''
    )
    .trim();

  if (DUTCH_SINGULAR_MAP[cleaned]) {
    return DUTCH_SINGULAR_MAP[cleaned];
  }
  return cleaned;
}

export function guessStorageCategory(
  ingredientName: string,
  ingredientMemory?: Record<string, StorageCategory>
): StorageCategory {
  const key = normalizeIngredientKey(ingredientName);
  if (key && ingredientMemory && ingredientMemory[key]) {
    return ingredientMemory[key];
  }

  const normalized = ingredientName.trim().toLowerCase();
  if (!normalized) return 'vers';

  if (DIEPVRIES_KEYWORDS.some((kw) => normalized.includes(kw))) {
    return 'diepvries';
  }
  if (BAKKERIJ_KEYWORDS.some((kw) => normalized.includes(kw))) {
    return 'bakkerij';
  }
  if (normalized.startsWith('vers') || normalized.includes(' verse ')) {
    return 'vers';
  }
  if (PROVIANDKAST_KEYWORDS.some((kw) => normalized.includes(kw))) {
    return 'proviandkast';
  }
  if (VERS_KEYWORDS.some((kw) => normalized.includes(kw))) {
    return 'vers';
  }
  return 'vers';
}

export function parseNumericAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.');
  if (!cleaned) return null;

  const mixedFraction = cleaned.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedFraction) {
    const whole = Number(mixedFraction[1]);
    const num = Number(mixedFraction[2]);
    const den = Number(mixedFraction[3]);
    if (den !== 0) return whole + num / den;
  }

  const fraction = cleaned.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const num = Number(fraction[1]);
    const den = Number(fraction[2]);
    if (den !== 0) return num / den;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatAmountNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const rounded = Math.round(value * 100) / 100;
  const frac = rounded - Math.floor(rounded);
  const whole = Math.floor(rounded);
  if (Math.abs(frac - 0.5) < 0.03) return whole > 0 ? `${whole},5` : '0,5';
  if (Math.abs(frac - 0.25) < 0.03) return whole > 0 ? `${whole},25` : '0,25';
  if (Math.abs(frac - 0.75) < 0.03) return whole > 0 ? `${whole},75` : '0,75';
  return String(rounded).replace('.', ',');
}

export function scaleAmountString(rawAmount: string, ratio: number): string {
  if (!rawAmount.trim()) return '';
  if (Math.abs(ratio - 1) < 0.001) return rawAmount.trim();
  const num = parseNumericAmount(rawAmount);
  if (num === null) return rawAmount.trim();
  return formatAmountNumber(num * ratio);
}

function normalizeUnit(unit: string): string {
  const u = unit.trim().toLowerCase();
  if (u === 'gr' || u === 'gram' || u === 'g.') return 'g';
  if (u === 'kilogram' || u === 'kilo') return 'kg';
  if (u === 'milliliter') return 'ml';
  if (u === 'centiliter') return 'cl';
  if (u === 'liter' || u === 'ltr') return 'l';
  if (u === 'eetlepel' || u === 'eetlepels') return 'el';
  if (u === 'theelepel' || u === 'theelepels') return 'tl';
  if (u === 'stuks' || u === 'stuk') return 'stuks';
  if (u === 'teentje' || u === 'teentjes' || u === 'tenen') return 'tenen';
  if (u === 'takje' || u === 'takjes') return 'takjes';
  if (u === 'sneetje' || u === 'sneetjes' || u === 'sneden') return 'sneden';
  return u;
}

export interface AggregatedGroceryItem {
  key: string;
  name: string;
  displayAmount: string;
  storageCategory: StorageCategory;
  isRememberedPreference: boolean;
  sources: { recipeId: string; recipeTitle: string }[];
}

export function buildAggregatedShoppingList(
  recipes: Recipe[],
  selectedPlans: SelectedRecipePlan[],
  categoryOverrides: Record<string, StorageCategory>,
  ingredientMemory: Record<string, StorageCategory> = {}
): AggregatedGroceryItem[] {
  const recipeMap = new Map(recipes.map((r) => [r.id, r]));

  interface Bucket {
    key: string;
    name: string;
    storageCategory: StorageCategory;
    isRememberedPreference: boolean;
    numericTotals: Map<string, number>;
    freeformAmounts: string[];
    sources: Map<string, string>;
  }

  const buckets = new Map<string, Bucket>();

  for (const plan of selectedPlans) {
    const recipe = recipeMap.get(plan.recipeId);
    if (!recipe) continue;
    const ratio = recipe.servings > 0 ? plan.servings / recipe.servings : 1;

    for (const ing of recipe.ingredients) {
      if (!ing.name.trim()) continue;
      const baseKey = normalizeIngredientKey(ing.name);
      let bucket = buckets.get(baseKey);

      const remembered = ingredientMemory[baseKey];
      const override = categoryOverrides[baseKey];
      const resolvedCat = override ?? remembered ?? ing.storageCategory;

      if (!bucket) {
        bucket = {
          key: baseKey,
          name: ing.name.trim(),
          storageCategory: resolvedCat,
          isRememberedPreference: Boolean(remembered || override),
          numericTotals: new Map<string, number>(),
          freeformAmounts: [],
          sources: new Map<string, string>(),
        };
        buckets.set(baseKey, bucket);
      } else {
        // Prefer shorter canonical display name when merging (e.g. "Uien" over "Grote uien")
        if (ing.name.trim().length < bucket.name.length) {
          bucket.name = ing.name.trim();
        }
        if (override || remembered) {
          bucket.storageCategory = override ?? remembered;
          bucket.isRememberedPreference = true;
        }
      }

      bucket.sources.set(recipe.id, recipe.title);

      const parsed = parseNumericAmount(ing.amount);
      const normUnit = normalizeUnit(ing.unit);

      if (parsed !== null) {
        let scaledVal = parsed * ratio;
        let finalUnit = normUnit;

        if (finalUnit === 'kg') {
          scaledVal *= 1000;
          finalUnit = 'g';
        } else if (finalUnit === 'l') {
          scaledVal *= 1000;
          finalUnit = 'ml';
        } else if (finalUnit === 'cl') {
          scaledVal *= 10;
          finalUnit = 'ml';
        }

        const prev = bucket.numericTotals.get(finalUnit) ?? 0;
        bucket.numericTotals.set(finalUnit, prev + scaledVal);
      } else if (ing.amount.trim() || ing.unit.trim()) {
        const label = [ing.amount.trim(), ing.unit.trim()].filter(Boolean).join(' ');
        if (label && !bucket.freeformAmounts.includes(label)) {
          bucket.freeformAmounts.push(label);
        }
      }
    }
  }

  const items: AggregatedGroceryItem[] = [];

  for (const bucket of buckets.values()) {
    const parts: string[] = [];

    for (const [unit, total] of bucket.numericTotals.entries()) {
      if (unit === 'g' && total >= 1000) {
        parts.push(`${formatAmountNumber(total / 1000)} kg`);
      } else if (unit === 'ml' && total >= 1000) {
        parts.push(`${formatAmountNumber(total / 1000)} l`);
      } else if (unit) {
        parts.push(`${formatAmountNumber(total)} ${unit}`);
      } else {
        parts.push(formatAmountNumber(total));
      }
    }

    for (const free of bucket.freeformAmounts) {
      parts.push(free);
    }

    items.push({
      key: bucket.key,
      name: bucket.name,
      displayAmount: parts.join(' + ') || 'naar smaak',
      storageCategory: bucket.storageCategory,
      isRememberedPreference: bucket.isRememberedPreference,
      sources: Array.from(bucket.sources.entries()).map(([recipeId, recipeTitle]) => ({
        recipeId,
        recipeTitle,
      })),
    });
  }

  return items.sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

// =============================================================================
// Recurring Staple Purchase Cycle Mathematics
// =============================================================================
const DAY_MS = 86_400_000;

export function computeAverageIntervalDays(
  purchaseDatesMs: number[],
  fallbackIntervalDays: number
): number {
  const sorted = [...purchaseDatesMs]
    .filter((ms) => Number.isFinite(ms) && ms > 0)
    .sort((a, b) => a - b);

  if (sorted.length < 2) {
    return Math.max(1, Math.round(fallbackIntervalDays || 14));
  }

  let totalGapDays = 0;
  let validGaps = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = (sorted[i] - sorted[i - 1]) / DAY_MS;
    if (gap >= 0.5) {
      totalGapDays += gap;
      validGaps += 1;
    }
  }

  if (validGaps === 0) {
    return Math.max(1, Math.round(fallbackIntervalDays || 14));
  }

  return Math.max(1, Math.round(totalGapDays / validGaps));
}

export interface RecurringItemStatus {
  daysSinceLast: number;
  effectiveAverageDays: number;
  progressRatio: number;
  isDueToCheck: boolean;
  daysUntilAverage: number;
}

export function getRecurringItemStatus(
  item: RecurringItem,
  nowMs = Date.now()
): RecurringItemStatus {
  const effectiveAverageDays = computeAverageIntervalDays(
    item.purchaseDatesMs,
    item.averageIntervalDays
  );
  const lastMs =
    item.lastPurchasedAtMs ||
    (item.purchaseDatesMs.length > 0 ? Math.max(...item.purchaseDatesMs) : nowMs);

  const daysSinceLast = Math.max(0, Math.floor((nowMs - lastMs) / DAY_MS));
  const progressRatio = effectiveAverageDays > 0 ? daysSinceLast / effectiveAverageDays : 0;
  // Trigger "te checken in voorraad" when reaching ~85% of the average repurchase cycle
  const thresholdDays = Math.max(1, Math.floor(effectiveAverageDays * 0.85));
  const isDueToCheck = daysSinceLast >= thresholdDays;
  const daysUntilAverage = effectiveAverageDays - daysSinceLast;

  return {
    daysSinceLast,
    effectiveAverageDays,
    progressRatio,
    isDueToCheck,
    daysUntilAverage,
  };
}
