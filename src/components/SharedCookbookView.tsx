import React, { useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Check, Copy, FileDown, Search } from 'lucide-react';
import { Recipe, SharedCookbook, SharedRecipeSnapshot } from '../types';
import { generateCookbookPdf } from '../utils/pdfCookbook';
import { RecipeImage } from './RecipeImage';

interface SharedCookbookViewProps {
  sharedCookbook: SharedCookbook;
  canImportToOwnBook: boolean;
  onCopyRecipeToOwnBook?: (snapshot: SharedRecipeSnapshot) => Promise<void>;
  onExitSharedView: () => void;
}

export const SharedCookbookView: React.FC<SharedCookbookViewProps> = ({
  sharedCookbook,
  canImportToOwnBook,
  onCopyRecipeToOwnBook,
  onExitSharedView,
}) => {
  const [search, setSearch] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<SharedRecipeSnapshot | null>(null);
  const [copiedIds, setCopiedIds] = useState<Record<string, boolean>>({});
  const [exportingPdf, setExportingPdf] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sharedCookbook.recipesSnapshot;
    return sharedCookbook.recipesSnapshot.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.subtitle.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(q))
    );
  }, [sharedCookbook.recipesSnapshot, search]);

  const handleExportSharedPdf = async () => {
    setExportingPdf(true);
    try {
      const asRecipes: Recipe[] = sharedCookbook.recipesSnapshot.map((s) => ({
        ...s,
        ownerId: sharedCookbook.ownerId,
        extraImages: [],
        videoUrl: '',
        videoTitle: '',
        videoLocalId: '',
        createdAtMs: sharedCookbook.createdAtMs,
        updatedAtMs: sharedCookbook.updatedAtMs,
      }));
      await generateCookbookPdf(asRecipes, {}, {
        title: sharedCookbook.cookbookTitle,
        subtitle: sharedCookbook.cookbookSubtitle,
        familyName: sharedCookbook.familyName,
        includeCover: true,
        includeToc: true,
        includePhotos: true,
        photoOnOppositePage: true,
        includeComments: false,
        includeRegister: true,
        selectedRecipeIds: asRecipes.map((r) => r.id),
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleCopyRecipe = async (snap: SharedRecipeSnapshot) => {
    if (!onCopyRecipeToOwnBook) return;
    await onCopyRecipeToOwnBook(snap);
    setCopiedIds((prev) => ({ ...prev, [snap.id]: true }));
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#111315]">
      <header className="sticky top-0 z-30 bg-[#FAFAFA]/95 backdrop-blur-sm border-b border-zinc-200">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onExitSharedView}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-950 whitespace-nowrap cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Eigen Tafelboek
            </button>
            <span className="text-zinc-300">|</span>
            <span className="font-editorial text-lg font-semibold text-zinc-950 truncate">
              {sharedCookbook.cookbookTitle}
            </span>
          </div>

          <button
            type="button"
            onClick={() => void handleExportSharedPdf()}
            disabled={exportingPdf || sharedCookbook.recipesSnapshot.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5" />
            {exportingPdf ? 'PDF maken...' : 'Download PDF-kookboek'}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 sm:px-8 py-8 space-y-8">
        {selectedRecipe ? (
          <article className="bg-white border border-zinc-200 rounded-2xl p-6 sm:p-10 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedRecipe(null)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-950 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Alle gedeelde recepten
              </button>

              {sharedCookbook.allowCopy && canImportToOwnBook && onCopyRecipeToOwnBook && (
                <button
                  type="button"
                  onClick={() => void handleCopyRecipe(selectedRecipe)}
                  disabled={copiedIds[selectedRecipe.id]}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg disabled:opacity-70 cursor-pointer"
                >
                  {copiedIds[selectedRecipe.id] ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Gekopieerd naar jouw kookboek
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Kopieer naar mijn kookboek
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="space-y-2 border-b border-zinc-200 pb-5">
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                {selectedRecipe.category} · Door {selectedRecipe.authorName}
              </p>
              <h1 className="font-editorial text-3xl sm:text-4xl font-semibold text-zinc-950">
                {selectedRecipe.title}
              </h1>
              {selectedRecipe.subtitle && (
                <p className="text-sm text-zinc-600">{selectedRecipe.subtitle}</p>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-4 space-y-5">
                <div className="text-sm space-y-1">
                  <p className="font-semibold text-zinc-950">
                    Voor {selectedRecipe.servings} personen
                  </p>
                  <p className="text-zinc-600">
                    Voorbereiden: {selectedRecipe.prepMinutes} min · Bereiden:{' '}
                    {selectedRecipe.cookMinutes} min
                  </p>
                </div>

                <ul className="space-y-2 text-sm">
                  {selectedRecipe.ingredients.map((ing) => (
                    <li key={ing.id} className="font-medium text-zinc-900">
                      {[ing.amount, ing.unit, ing.name].filter(Boolean).join(' ')}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="lg:col-span-8 space-y-6">
                {selectedRecipe.coverImage && (
                  <div className="rounded-xl overflow-hidden border border-zinc-200 max-h-[380px]">
                    <RecipeImage
                      src={selectedRecipe.coverImage}
                      alt={selectedRecipe.title}
                      fallbackTitle={selectedRecipe.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {selectedRecipe.story && (
                  <p className="text-sm italic text-zinc-700 leading-relaxed">
                    {selectedRecipe.story}
                  </p>
                )}

                <div className="space-y-3 text-sm text-zinc-800 leading-relaxed">
                  {selectedRecipe.steps.map((step, idx) => (
                    <p key={idx}>
                      <span className="font-semibold text-zinc-950 mr-1.5">{idx + 1}.</span>
                      {step}
                    </p>
                  ))}
                </div>

                {selectedRecipe.notes && (
                  <div className="pt-4 border-t border-zinc-200 text-sm text-zinc-600">
                    <span className="font-semibold text-zinc-900">Kooktip: </span>
                    {selectedRecipe.notes}
                  </div>
                )}
              </div>
            </div>
          </article>
        ) : (
          <>
            <section className="bg-white border border-zinc-200 rounded-2xl p-7 sm:p-9 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
              <div className="space-y-2">
                <p className="text-xs font-medium text-[#14532D]">
                  Gedeeld familiekookboek · {sharedCookbook.familyName} · Gedeeld door{' '}
                  {sharedCookbook.sharedByName}
                </p>
                <h1 className="font-editorial text-3xl sm:text-4xl font-semibold text-zinc-950">
                  {sharedCookbook.cookbookTitle}
                </h1>
                {sharedCookbook.cookbookSubtitle && (
                  <p className="text-sm text-zinc-600 max-w-2xl">
                    {sharedCookbook.cookbookSubtitle}
                  </p>
                )}
              </div>

              <div className="relative w-full sm:w-72 shrink-0">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Zoek in gedeelde recepten..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                />
              </div>
            </section>

            {filtered.length === 0 ? (
              <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center space-y-2">
                <BookOpen className="w-8 h-8 text-zinc-300 mx-auto" />
                <p className="font-editorial text-lg font-semibold text-zinc-900">
                  Geen recepten gevonden
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filtered.map((recipe) => (
                  <article
                    key={recipe.id}
                    className="bg-white border border-zinc-200 rounded-2xl overflow-hidden flex flex-col"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedRecipe(recipe)}
                      className="aspect-[4/3] bg-zinc-100 overflow-hidden text-left cursor-pointer"
                    >
                      <RecipeImage
                        src={recipe.coverImage}
                        alt={recipe.title}
                        fallbackTitle={recipe.title}
                        className="w-full h-full object-cover"
                      />
                    </button>
                    <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                      <div className="space-y-1.5">
                        <p className="text-xs text-zinc-500">
                          <span className="font-medium text-[#14532D]">{recipe.category}</span> ·{' '}
                          {recipe.prepMinutes + recipe.cookMinutes} min
                        </p>
                        <button
                          type="button"
                          onClick={() => setSelectedRecipe(recipe)}
                          className="text-left block cursor-pointer"
                        >
                          <h2 className="font-editorial text-xl font-semibold text-zinc-950 hover:text-[#14532D] transition-colors">
                            {recipe.title}
                          </h2>
                        </button>
                        {recipe.subtitle && (
                          <p className="text-xs text-zinc-600 line-clamp-2">{recipe.subtitle}</p>
                        )}
                      </div>

                      <div className="pt-3 border-t border-zinc-100 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedRecipe(recipe)}
                          className="text-xs font-medium text-zinc-700 hover:text-zinc-950 cursor-pointer"
                        >
                          Lees recept
                        </button>
                        {sharedCookbook.allowCopy &&
                          canImportToOwnBook &&
                          onCopyRecipeToOwnBook && (
                            <button
                              type="button"
                              onClick={() => void handleCopyRecipe(recipe)}
                              disabled={copiedIds[recipe.id]}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-lg cursor-pointer"
                            >
                              {copiedIds[recipe.id] ? (
                                <>
                                  <Check className="w-3 h-3 text-[#14532D]" />
                                  Gekopieerd
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  Kopieer
                                </>
                              )}
                            </button>
                          )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};
