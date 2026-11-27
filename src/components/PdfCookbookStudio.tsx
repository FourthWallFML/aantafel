import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  FileDown,
  Printer,
  VideoOff,
} from 'lucide-react';
import {
  CookbookPdfSettings,
  Recipe,
  RecipeComment,
  UserProfile,
} from '../types';
import { buildAlphabeticalRegister, generateCookbookPdf } from '../utils/pdfCookbook';
import { RecipeImage } from './RecipeImage';

interface PdfCookbookStudioProps {
  recipes: Recipe[];
  commentsByRecipe: Record<string, RecipeComment[]>;
  profile: UserProfile;
  onSaveProfile: (next: UserProfile) => Promise<void>;
}

type PreviewPageKind = 'spread' | 'toc' | 'register' | 'cover';

function formatDurationNl(minutes: number): string {
  if (!minutes || minutes <= 0) return '0 minuten';
  if (minutes < 60) return `${minutes} minuten`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} uur` : `${h} uur en ${m} minuten`;
}

export function PdfCookbookStudio({
  recipes,
  commentsByRecipe,
  profile,
  onSaveProfile,
}: PdfCookbookStudioProps) {
  const [title, setTitle] = useState(profile.cookbookTitle || 'Aan Tafel!');
  const [subtitle, setSubtitle] = useState(
    profile.cookbookSubtitle || 'Verzameld aan de keukentafel — recepten om door te geven'
  );
  const [familyName, setFamilyName] = useState(profile.familyName || 'Familie-editie');
  const [includeCover, setIncludeCover] = useState(true);
  const [includeToc, setIncludeToc] = useState(true);
  const [includePhotos, setIncludePhotos] = useState(true);
  const [photoOnOppositePage, setPhotoOnOppositePage] = useState(true);
  const [includeComments, setIncludeComments] = useState(true);
  const [includeRegister, setIncludeRegister] = useState(true);
  const [orderedIds, setOrderedIds] = useState<string[]>(() => recipes.map((r) => r.id));
  const [previewPage, setPreviewPage] = useState<PreviewPageKind>('spread');
  const [previewRecipeIndex, setPreviewRecipeIndex] = useState(0);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setOrderedIds((prev) => {
      const validIds = new Set(recipes.map((r) => r.id));
      const kept = prev.filter((id) => validIds.has(id));
      const newlyAdded = recipes.map((r) => r.id).filter((id) => !kept.includes(id));
      return [...kept, ...newlyAdded];
    });
  }, [recipes]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(recipes.map((r) => r.id))
  );

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const r of recipes) {
        if (!prev.has(r.id) && prev.size === 0) {
          next.add(r.id);
        }
      }
      return next;
    });
  }, [recipes]);

  const selectedOrderedRecipes = useMemo(
    () =>
      orderedIds
        .filter((id) => selectedIds.has(id))
        .map((id) => recipes.find((r) => r.id === id))
        .filter((r): r is Recipe => Boolean(r)),
    [orderedIds, selectedIds, recipes]
  );

  const videosExcludedCount = useMemo(
    () => selectedOrderedRecipes.filter((r) => Boolean(r.videoUrl || r.videoLocalId)).length,
    [selectedOrderedRecipes]
  );

  // Calculate preview page numbers matching the actual PDF pagination
  const previewPagination = useMemo(() => {
    let page = 1;
    if (includeCover) page += 1;
    if (includeToc) page += 1;

    const records: {
      recipe: Recipe;
      page: number;
      photoPage: number | null;
      photoEndPage: number | null;
      photoRefLabel: string;
    }[] = [];
    const chapterStarts = new Map<string, number>();

    for (const r of selectedOrderedRecipes) {
      const textPage = page;
      if (!chapterStarts.has(r.category)) {
        chapterStarts.set(r.category, textPage);
      }
      page += 1;

      const hasCover = Boolean(r.coverImage);
      const extraCount = (r.extraImages || []).filter(Boolean).length;
      const totalPhotos = (hasCover ? 1 : 0) + extraCount;

      let photoPage: number | null = null;
      let photoEndPage: number | null = null;
      let photoRefLabel = '';

      if (includePhotos && totalPhotos > 0) {
        if (photoOnOppositePage) {
          photoPage = page;
          const photoPagesCount = (hasCover ? 1 : 0) + (extraCount > 0 ? 1 : 0);
          photoEndPage = photoPage + photoPagesCount - 1;
          page += photoPagesCount;

          if (totalPhotos === 1) {
            photoRefLabel = `Foto op bladzijde ${photoPage}`;
          } else if (photoEndPage === photoPage) {
            photoRefLabel = `Foto's op bladzijde ${photoPage}`;
          } else {
            photoRefLabel = `Foto's op bladzijde ${photoPage}–${photoEndPage}`;
          }
        } else {
          if (hasCover && extraCount > 0) {
            const extraPage = page;
            page += 1;
            photoPage = textPage;
            photoEndPage = extraPage;
            photoRefLabel = `Foto's op bladzijde ${textPage} en ${extraPage}`;
          } else if (hasCover) {
            photoPage = textPage;
            photoEndPage = textPage;
            photoRefLabel = `Foto op bladzijde ${textPage}`;
          } else {
            const extraPage = page;
            page += 1;
            photoPage = extraPage;
            photoEndPage = extraPage;
            photoRefLabel = `${extraCount === 1 ? 'Foto' : "Foto's"} op bladzijde ${extraPage}`;
          }
        }
      }

      records.push({ recipe: r, page: textPage, photoPage, photoEndPage, photoRefLabel });
    }

    const registerPage = includeRegister ? page : null;
    const registerEntries = buildAlphabeticalRegister(
      records.map((rec) => ({ recipe: rec.recipe, page: rec.page }))
    );

    return {
      records,
      chapterStarts: Array.from(chapterStarts.entries()),
      registerPage,
      registerEntries,
    };
  }, [selectedOrderedRecipes, includeCover, includeToc, includePhotos, photoOnOppositePage, includeRegister]);

  const toggleRecipe = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const moveRecipe = (id: string, delta: -1 | 1) => {
    setOrderedIds((prev) => {
      const idx = prev.indexOf(id);
      const target = idx + delta;
      if (idx === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const handleGeneratePdf = async () => {
    if (selectedOrderedRecipes.length === 0) return;
    setGenerating(true);
    try {
      const settings: CookbookPdfSettings = {
        title: title.trim() || 'Ons Familiekookboek',
        subtitle: subtitle.trim(),
        familyName: familyName.trim() || 'Familiekookboek',
        includeCover,
        includeToc,
        includePhotos,
        photoOnOppositePage,
        includeComments,
        includeRegister,
        selectedRecipeIds: selectedOrderedRecipes.map((r) => r.id),
      };
      await onSaveProfile({
        ...profile,
        cookbookTitle: settings.title.slice(0, 120),
        cookbookSubtitle: settings.subtitle.slice(0, 200),
        familyName: settings.familyName.slice(0, 100),
      });
      await generateCookbookPdf(recipes, commentsByRecipe, settings);
    } finally {
      setGenerating(false);
    }
  };

  const activeRecord =
    previewPagination.records[
      Math.min(previewRecipeIndex, Math.max(0, previewPagination.records.length - 1))
    ];
  const logoFullSrc = `${import.meta.env.BASE_URL}logo-aantafel.png`;
  const showCustomCoverTitle =
    title.trim().length > 0 &&
    title.trim().toLowerCase() !== 'aan tafel!' &&
    title.trim().toLowerCase() !== 'aan tafel';

  return (
    <div className="space-y-8">
      {/* Studio Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-zinc-200 no-print">
        <div className="space-y-1.5">
          <h1 className="font-editorial text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-950">
            Afdrukbaar PDF-kookboek
          </h1>
          <p className="text-sm sm:text-base text-zinc-600 max-w-2xl">
            Strakke boekopmaak met aparte grote fotopagina tegenover elk recept, borderless ingrediëntenkolom, schuingedrukte inleiding, Inhoudsopgave en 3-koloms alfabetisch Register.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={selectedOrderedRecipes.length === 0}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-zinc-800 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Afdrukken
          </button>
          <button
            type="button"
            onClick={handleGeneratePdf}
            disabled={generating || selectedOrderedRecipes.length === 0}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 cursor-pointer"
          >
            <FileDown className="w-4 h-4" />
            {generating
              ? 'PDF-kookboek genereren...'
              : `Download PDF (${selectedOrderedRecipes.length} ${
                  selectedOrderedRecipes.length === 1 ? 'recept' : 'recepten'
                })`}
          </button>
        </div>
      </div>

      {/* Studio Split Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Left Sidebar: Book Settings & Order */}
        <aside className="xl:col-span-4 space-y-6 no-print">
          <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
            <h2 className="font-editorial text-lg font-semibold text-zinc-950">
              Boekomslag &amp; opmaak
            </h2>

            <div className="space-y-3">
              <div>
                <label htmlFor="pdf-title" className="block text-xs font-medium text-zinc-700 mb-1">
                  Titel op de kaft
                </label>
                <input
                  id="pdf-title"
                  type="text"
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                />
              </div>

              <div>
                <label htmlFor="pdf-family" className="block text-xs font-medium text-zinc-700 mb-1">
                  Familienaam / Editie
                </label>
                <input
                  id="pdf-family"
                  type="text"
                  maxLength={100}
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                />
              </div>

              <div>
                <label htmlFor="pdf-subtitle" className="block text-xs font-medium text-zinc-700 mb-1">
                  Ondertitel of opdracht
                </label>
                <textarea
                  id="pdf-subtitle"
                  rows={2}
                  maxLength={200}
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-100 space-y-2.5">
              <label className="flex items-center justify-between text-xs text-zinc-800 cursor-pointer">
                <span>Voorblad opnemen</span>
                <input
                  type="checkbox"
                  checked={includeCover}
                  onChange={(e) => setIncludeCover(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-300 text-[#14532D] focus:ring-[#14532D]"
                />
              </label>
              <label className="flex items-center justify-between text-xs text-zinc-800 cursor-pointer">
                <span>Inhoud (hoofdstukken + paginanummers)</span>
                <input
                  type="checkbox"
                  checked={includeToc}
                  onChange={(e) => setIncludeToc(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-300 text-[#14532D] focus:ring-[#14532D]"
                />
              </label>
              <label className="flex items-center justify-between text-xs text-zinc-800 cursor-pointer">
                <span>Receptfoto&apos;s afdrukken</span>
                <input
                  type="checkbox"
                  checked={includePhotos}
                  onChange={(e) => setIncludePhotos(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-300 text-[#14532D] focus:ring-[#14532D]"
                />
              </label>
              {includePhotos && (
                <label className="flex items-center justify-between text-xs text-zinc-700 pl-3 cursor-pointer">
                  <span>Volledige fotopagina rechts naast recept</span>
                  <input
                    type="checkbox"
                    checked={photoOnOppositePage}
                    onChange={(e) => setPhotoOnOppositePage(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-300 text-[#14532D] focus:ring-[#14532D]"
                  />
                </label>
              )}
              <label className="flex items-center justify-between text-xs text-zinc-800 cursor-pointer">
                <span>Familienotities meenemen</span>
                <input
                  type="checkbox"
                  checked={includeComments}
                  onChange={(e) => setIncludeComments(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-300 text-[#14532D] focus:ring-[#14532D]"
                />
              </label>
              <label className="flex items-center justify-between text-xs text-zinc-800 cursor-pointer">
                <span>Alfabetisch Register achteraan (3 kolommen)</span>
                <input
                  type="checkbox"
                  checked={includeRegister}
                  onChange={(e) => setIncludeRegister(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-300 text-[#14532D] focus:ring-[#14532D]"
                />
              </label>
            </div>

            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg flex items-start gap-2.5 text-xs text-zinc-600">
              <VideoOff className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
              <p className="leading-5">
                Kookvideo&apos;s worden automatisch uitgesloten uit de printversie
                {videosExcludedCount > 0
                  ? ` (${videosExcludedCount} ${videosExcludedCount === 1 ? 'recept bevat' : 'recepten bevatten'} een digitale video).`
                  : '.'}
              </p>
            </div>
          </div>

          {/* Recipe Selection & Chapter Order */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-editorial text-lg font-semibold text-zinc-950">
                Volgorde &amp; selectie ({selectedOrderedRecipes.length}/{recipes.length})
              </h2>
              <button
                type="button"
                onClick={() =>
                  setSelectedIds(
                    selectedIds.size === recipes.length
                      ? new Set()
                      : new Set(recipes.map((r) => r.id))
                  )
                }
                className="text-xs font-medium text-[#14532D] hover:underline whitespace-nowrap cursor-pointer"
              >
                {selectedIds.size === recipes.length ? 'Alles deselecteren' : 'Alles selecteren'}
              </button>
            </div>

            <ul className="divide-y divide-zinc-100">
              {orderedIds.map((id, idx) => {
                const recipe = recipes.find((r) => r.id === id);
                if (!recipe) return null;
                const isSelected = selectedIds.has(id);

                return (
                  <li key={id} className="py-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleRecipe(id)}
                      className="flex items-center gap-2.5 min-w-0 text-left flex-1 cursor-pointer"
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
                        <span className="text-xs font-medium text-zinc-900 block truncate">
                          {recipe.title}
                        </span>
                        <span className="text-[11px] text-zinc-500 block">
                          {recipe.category} · {recipe.authorName}
                        </span>
                      </div>
                    </button>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveRecipe(id, -1)}
                        disabled={idx === 0}
                        className="p-1 text-zinc-400 hover:text-zinc-900 disabled:opacity-25 cursor-pointer"
                        aria-label="Omhoog verplaatsen"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveRecipe(id, 1)}
                        disabled={idx === orderedIds.length - 1}
                        className="p-1 text-zinc-400 hover:text-zinc-900 disabled:opacity-25 cursor-pointer"
                        aria-label="Omlaag verplaatsen"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        {/* Right Column: Live Book Print Spread Preview (Exact Reference Style) */}
        <section className="xl:col-span-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 no-print">
            <div className="inline-flex items-center gap-1 p-1 bg-zinc-200/70 rounded-lg">
              <button
                type="button"
                onClick={() => setPreviewPage('spread')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  previewPage === 'spread'
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Recept-spread
              </button>
              <button
                type="button"
                onClick={() => setPreviewPage('toc')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  previewPage === 'toc'
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Inhoud
              </button>
              <button
                type="button"
                onClick={() => setPreviewPage('register')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  previewPage === 'register'
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Register
              </button>
              <button
                type="button"
                onClick={() => setPreviewPage('cover')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  previewPage === 'cover'
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Voorblad
              </button>
            </div>

            {previewPage === 'spread' && selectedOrderedRecipes.length > 1 && (
              <select
                value={Math.min(previewRecipeIndex, selectedOrderedRecipes.length - 1)}
                onChange={(e) => setPreviewRecipeIndex(Number(e.target.value))}
                aria-label="Kies voorbeeldrecept"
                className="px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
              >
                {selectedOrderedRecipes.map((r, i) => (
                  <option key={r.id} value={i}>
                    {i + 1}. {r.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Paper Stage */}
          <div className="bg-zinc-200/70 border border-zinc-200 rounded-2xl p-4 sm:p-6 flex justify-center print:bg-white print:border-none print:p-0">
            {selectedOrderedRecipes.length === 0 ? (
              <div className="w-full max-w-[540px] aspect-[210/297] bg-white border border-zinc-200 shadow-sm p-10 flex flex-col items-center justify-center text-center gap-3">
                <BookOpen className="w-8 h-8 text-zinc-300" strokeWidth={1.5} />
                <p className="text-base font-semibold text-zinc-900">Geen recepten geselecteerd</p>
                <p className="text-xs text-zinc-500 max-w-xs">
                  Vink links minstens één recept aan om de drukproef te bekijken.
                </p>
              </div>
            ) : previewPage === 'spread' && activeRecord ? (
              /* TWO-PAGE OPEN BOOK SPREAD (Exact match to Reference Photos 1, 2 & 3) */
              <div
                className={`w-full grid gap-3 ${
                  includePhotos && photoOnOppositePage && activeRecord.recipe.coverImage
                    ? 'grid-cols-1 md:grid-cols-2'
                    : 'max-w-[540px] grid-cols-1'
                }`}
              >
                {/* LEFT PAGE: Recipe Text Sheet */}
                <div className="bg-white border border-zinc-200 shadow-sm p-6 sm:p-8 flex flex-col justify-between min-h-[560px] font-sans text-[#121212]">
                  <div className="space-y-5">
                    {/* Top-left uppercase chapter kicker */}
                    <p className="text-[9px] tracking-[0.08em] text-zinc-600 uppercase">
                      {activeRecord.recipe.category}
                    </p>

                    {/* Bold clean sans-serif title */}
                    <h3 className="text-xl sm:text-[22px] font-bold tracking-tight text-[#121212] leading-snug pt-1">
                      {activeRecord.recipe.title}
                    </h3>

                    {includePhotos && !photoOnOppositePage && activeRecord.recipe.coverImage && (
                      <div className="aspect-[16/8] w-full overflow-hidden">
                        <RecipeImage
                          src={activeRecord.recipe.coverImage}
                          alt={activeRecord.recipe.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    {/* Single razor-thin horizontal rule */}
                    <div className="border-t border-zinc-300 pt-5 grid grid-cols-12 gap-5 items-start">
                      {/* Left narrow borderless column: Timings + Bold hanging-indent ingredients */}
                      <div className="col-span-4 space-y-4">
                        <div className="space-y-0.5 text-[9.5px] leading-tight">
                          <p className="font-bold text-[#121212]">
                            Voor {activeRecord.recipe.servings}{' '}
                            {activeRecord.recipe.servings === 1 ? 'persoon' : 'personen'}
                          </p>
                          <p className="text-zinc-700">
                            Voorbereiden: {formatDurationNl(activeRecord.recipe.prepMinutes)}
                          </p>
                          <p className="text-zinc-700">
                            Bereiden: {formatDurationNl(activeRecord.recipe.cookMinutes)}
                          </p>
                        </div>

                        <ul className="space-y-1.5 text-[9px] leading-[1.38]">
                          {activeRecord.recipe.ingredients.map((ing) => {
                            const qty = [ing.amount, ing.unit].filter(Boolean).join(' ');
                            const prep = (ing.preparation || '').trim();
                            const boldBase = [qty, ing.name.trim()].filter(Boolean).join(' ');
                            return (
                              <li key={ing.id} className="pl-2 -indent-2">
                                <span className="font-bold text-[#121212]">
                                  {boldBase}
                                  {prep ? ',' : ''}
                                </span>
                                {prep && (
                                  <span className="font-normal text-zinc-700"> {prep}</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>

                      {/* Right wider column: Strictly italic intro + Inline bold numbered steps + Photo ref */}
                      <div className="col-span-8 space-y-4 text-[10px] leading-[1.58] text-[#121212]">
                        {(activeRecord.recipe.subtitle || activeRecord.recipe.story) && (
                          <div className="italic space-y-2.5 text-[#18181B]">
                            {activeRecord.recipe.subtitle && <p>{activeRecord.recipe.subtitle}</p>}
                            {activeRecord.recipe.story && <p>{activeRecord.recipe.story}</p>}
                          </div>
                        )}

                        <ol className="space-y-3">
                          {activeRecord.recipe.steps.map((step, i) => (
                            <li key={i}>
                              <strong className="font-bold">{i + 1}.</strong> {step}
                            </li>
                          ))}
                        </ol>

                        {activeRecord.recipe.notes && (
                          <p className="italic text-[9.5px] text-zinc-700 pt-1">
                            {activeRecord.recipe.notes}
                          </p>
                        )}

                        {includeComments &&
                          (commentsByRecipe[activeRecord.recipe.id] || []).length > 0 && (
                            <div className="pt-2 space-y-1">
                              <div className="w-8 border-t border-zinc-300 mb-2" />
                              {(commentsByRecipe[activeRecord.recipe.id] || []).map((c) => (
                                <p key={c.id} className="italic text-[9.5px] text-zinc-600">
                                  {c.text} — {c.authorName}
                                </p>
                              ))}
                            </div>
                          )}

                        {activeRecord.photoRefLabel && (
                          <div className="pt-3">
                            <div className="w-7 border-t border-zinc-300 mb-2" />
                            <p className="italic text-[9px] text-zinc-600 tabular-nums">
                              {activeRecord.photoRefLabel}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom-left page number */}
                  <div className="pt-6 text-[9.5px] text-[#121212] tabular-nums">
                    {activeRecord.page}
                  </div>
                </div>

                {/* RIGHT PAGE: Full-Page Photograph Plate (Exact match to Reference Photo 2) */}
                {includePhotos && photoOnOppositePage && activeRecord.recipe.coverImage && (
                  <div className="bg-white border border-zinc-200 shadow-sm p-6 sm:p-8 flex flex-col justify-between min-h-[560px] font-sans">
                    <p className="text-[9px] tracking-[0.08em] text-zinc-600 uppercase text-right mb-3">
                      {activeRecord.recipe.category}
                    </p>
                    <div className="flex-1 overflow-hidden bg-zinc-100">
                      <RecipeImage
                        src={activeRecord.recipe.coverImage}
                        alt={activeRecord.recipe.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="pt-4 flex items-center justify-between text-[9.5px] text-[#121212] tabular-nums">
                      <span className="text-[8.5px] italic text-zinc-500">
                        {(activeRecord.recipe.extraImages || []).filter(Boolean).length > 0
                          ? `+ ${(activeRecord.recipe.extraImages || []).filter(Boolean).length} extra foto('s) op blz. ${activeRecord.photoEndPage}`
                          : ''}
                      </span>
                      <span>{activeRecord.photoPage}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : previewPage === 'toc' ? (
              /* INHOUD PAGE (Exact match to Reference Photo 5: bold Inhoud, bold chapters left, bold numbers right, ZERO lines!) */
              <div className="w-full max-w-[520px] aspect-[210/297] bg-white border border-zinc-200 shadow-sm p-10 sm:p-14 flex flex-col font-sans text-[#121212]">
                <h3 className="text-2xl sm:text-3xl font-bold tracking-tight mb-12">Inhoud</h3>

                <ul className="space-y-4">
                  {previewPagination.chapterStarts.map(([chapter, startPg]) => (
                    <li
                      key={chapter}
                      className="flex items-baseline justify-between text-base font-bold"
                    >
                      <span>{chapter}</span>
                      <span className="tabular-nums">{startPg}</span>
                    </li>
                  ))}
                </ul>

                {previewPagination.registerPage !== null && (
                  <div className="mt-10 pt-2">
                    <div className="flex items-baseline justify-between text-sm font-bold">
                      <span>Register</span>
                      <span className="tabular-nums">{previewPagination.registerPage}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : previewPage === 'register' ? (
              /* 3-COLUMN ALPHABETICAL REGISTER (Exact match to Reference Photo 4) */
              <div className="w-full max-w-[560px] min-h-[680px] bg-white border border-zinc-200 shadow-sm p-7 sm:p-9 flex flex-col justify-between font-sans text-[#121212]">
                <div className="space-y-5">
                  <p className="text-[9px] tracking-[0.1em] text-zinc-600 uppercase text-right">
                    REGISTER
                  </p>

                  <div className="columns-2 sm:columns-3 gap-5 text-[8.5px] leading-[1.45]">
                    {previewPagination.registerEntries.map((entry) => (
                      <div key={entry.headword} className="break-inside-avoid mb-1.5">
                        {entry.refs.length === 1 &&
                        entry.headword === entry.refs[0].title.toLowerCase() ? (
                          <p className="font-bold">
                            {entry.refs[0].title}{' '}
                            <span className="tabular-nums">{entry.refs[0].page}</span>
                          </p>
                        ) : entry.refs.length === 1 ? (
                          <p>
                            <strong className="font-bold">{entry.headword}:</strong>{' '}
                            {entry.refs[0].title}{' '}
                            <span className="tabular-nums">{entry.refs[0].page}</span>
                          </p>
                        ) : (
                          <div>
                            <p className="font-bold">{entry.headword}:</p>
                            {entry.refs.map((ref) => (
                              <p key={ref.title} className="pl-2.5">
                                {ref.title} <span className="tabular-nums">{ref.page}</span>
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-5 text-[9.5px] text-right tabular-nums">
                  {previewPagination.registerPage ?? '–'}
                </div>
              </div>
            ) : (
              /* CLASSIC EDITORIAL FRONTPAGE WITH AAN TAFEL! LOGO */
              <div className="w-full max-w-[520px] aspect-[210/297] bg-white border border-zinc-200 shadow-sm px-10 py-12 sm:px-14 sm:py-14 flex flex-col items-center justify-between text-center font-sans text-[#121212]">
                <p className="text-[10px] tracking-[0.2em] text-zinc-500 uppercase">
                  {familyName || 'Familie-editie'}
                </p>

                <div className="flex flex-col items-center space-y-6 my-auto py-6 w-full">
                  <img
                    src={logoFullSrc}
                    alt="Aan Tafel! logo"
                    className="w-60 sm:w-68 h-auto object-contain select-none"
                  />

                  <div className="w-24 border-t border-zinc-300" />

                  <div className="space-y-2.5 max-w-xs">
                    {showCustomCoverTitle && (
                      <h3 className="text-lg font-bold tracking-tight text-[#1C3454]">
                        {title}
                      </h3>
                    )}
                    {subtitle && (
                      <p className="italic text-xs sm:text-sm text-zinc-600 leading-relaxed">
                        {subtitle}
                      </p>
                    )}
                  </div>
                </div>

                <p className="text-[10px] text-zinc-500 tabular-nums">
                  {selectedOrderedRecipes.length}{' '}
                  {selectedOrderedRecipes.length === 1 ? 'recept' : 'recepten'} ·{' '}
                  {new Date().getFullYear()}
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
