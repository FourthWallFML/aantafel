import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ImagePlus,
  Plus,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import {
  Ingredient,
  RECIPE_CATEGORIES,
  Recipe,
  RecipeCategory,
  STORAGE_CATEGORY_META,
  StorageCategory,
} from '../types';
import { guessStorageCategory } from '../utils/ingredientCategorizer';
import { compressImageFile, saveLocalVideo } from '../utils/mediaStorage';
import { RecipeImage } from './RecipeImage';

export type RecipeFormData = Omit<Recipe, 'id' | 'ownerId' | 'createdAtMs' | 'updatedAtMs'>;

interface RecipeEditorModalProps {
  initialRecipe?: Recipe | null;
  defaultAuthorName: string;
  ingredientMemory: Record<string, StorageCategory>;
  onRememberIngredientCategory: (ingredientName: string, category: StorageCategory) => Promise<void>;
  onClose: () => void;
  onSave: (data: RecipeFormData, existingId?: string) => Promise<void>;
}

function makeIngredient(overrides?: Partial<Ingredient>): Ingredient {
  return {
    id: `ing_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    amount: '',
    unit: '',
    preparation: '',
    storageCategory: 'vers',
    ...overrides,
  };
}

export function RecipeEditorModal({
  initialRecipe,
  defaultAuthorName,
  ingredientMemory,
  onRememberIngredientCategory,
  onClose,
  onSave,
}: RecipeEditorModalProps) {
  const [title, setTitle] = useState(initialRecipe?.title || '');
  const [subtitle, setSubtitle] = useState(initialRecipe?.subtitle || '');
  const [story, setStory] = useState(initialRecipe?.story || '');
  const [category, setCategory] = useState<RecipeCategory>(
    initialRecipe?.category || 'Hoofdgerecht'
  );
  const [prepMinutes, setPrepMinutes] = useState(initialRecipe?.prepMinutes ?? 20);
  const [cookMinutes, setCookMinutes] = useState(initialRecipe?.cookMinutes ?? 30);
  const [servings, setServings] = useState(initialRecipe?.servings ?? 4);
  const [authorName, setAuthorName] = useState(
    initialRecipe?.authorName || defaultAuthorName || 'Familielid'
  );
  const [coverImage, setCoverImage] = useState(initialRecipe?.coverImage || '');
  const [extraImages, setExtraImages] = useState<string[]>(initialRecipe?.extraImages || []);
  const [videoUrl, setVideoUrl] = useState(initialRecipe?.videoUrl || '');
  const [videoTitle, setVideoTitle] = useState(initialRecipe?.videoTitle || '');
  const [videoLocalId, setVideoLocalId] = useState(initialRecipe?.videoLocalId || '');
  const [videoFileName, setVideoFileName] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    initialRecipe?.ingredients && initialRecipe.ingredients.length > 0
      ? initialRecipe.ingredients
      : [makeIngredient(), makeIngredient(), makeIngredient()]
  );
  const [manualCategoryTouched, setManualCategoryTouched] = useState<Record<string, boolean>>({});
  const [steps, setSteps] = useState<string[]>(
    initialRecipe?.steps && initialRecipe.steps.length > 0 ? initialRecipe.steps : ['', '']
  );
  const [notes, setNotes] = useState(initialRecipe?.notes || '');

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const coverInputRef = useRef<HTMLInputElement>(null);
  const extraInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setErrorMessage('');
    try {
      const compressed = await compressImageFile(file, 960, 260000);
      setCoverImage(compressed);
    } catch {
      setErrorMessage('Kon de hoofdfoto niet verwerken. Probeer een JPG of PNG bestand.');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleExtraPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const remainingSlots = Math.max(0, 3 - extraImages.length);
    if (remainingSlots === 0) return;

    setUploadingPhoto(true);
    setErrorMessage('');
    try {
      const processed: string[] = [];
      for (const file of files.slice(0, remainingSlots)) {
        const compressed = await compressImageFile(file, 780, 140000);
        processed.push(compressed);
      }
      setExtraImages((prev) => [...prev, ...processed].slice(0, 3));
    } catch {
      setErrorMessage('Een of meer extra foto’s konden niet worden verwerkt.');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleLocalVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 150 * 1024 * 1024) {
      setErrorMessage('Videobestand is groter dan 150 MB. Gebruik voor grote video’s een YouTube- of Vimeo-link.');
      return;
    }
    setUploadingVideo(true);
    setErrorMessage('');
    try {
      const id = await saveLocalVideo(file);
      setVideoLocalId(id);
      setVideoFileName(file.name);
      if (!videoTitle.trim()) {
        setVideoTitle(file.name.replace(/\.[^.]+$/, ''));
      }
    } catch {
      setErrorMessage('Kon het videobestand niet opslaan in de browser.');
    } finally {
      setUploadingVideo(false);
      e.target.value = '';
    }
  };

  const updateIngredient = (id: string, patch: Partial<Ingredient>, isManualCat = false) => {
    if (isManualCat) {
      setManualCategoryTouched((prev) => ({ ...prev, [id]: true }));
    }
    setIngredients((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        if (patch.name !== undefined && !manualCategoryTouched[id] && !isManualCat) {
          next.storageCategory = guessStorageCategory(patch.name, ingredientMemory);
        }
        if (isManualCat && patch.storageCategory && next.name.trim()) {
          void onRememberIngredientCategory(next.name, patch.storageCategory);
        }
        return next;
      })
    );
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanTitle = title.trim().slice(0, 140);
    if (!cleanTitle) {
      setErrorMessage('Geef je recept eerst een titel.');
      return;
    }

    const cleanIngredients: Ingredient[] = ingredients
      .filter((i) => i.name.trim().length > 0)
      .slice(0, 60)
      .map((i) => ({
        id: i.id.slice(0, 64),
        name: i.name.trim().slice(0, 150),
        amount: i.amount.trim().slice(0, 40),
        unit: i.unit.trim().slice(0, 40),
        preparation: (i.preparation || '').trim().slice(0, 160),
        storageCategory: i.storageCategory,
      }));

    const cleanSteps = steps
      .map((s) => s.trim().slice(0, 1500))
      .filter((s) => s.length > 0)
      .slice(0, 40);

    const payload: RecipeFormData = {
      title: cleanTitle,
      subtitle: subtitle.trim().slice(0, 220),
      story: story.trim().slice(0, 3000),
      category,
      prepMinutes: Math.max(0, Math.min(1440, Number(prepMinutes) || 0)),
      cookMinutes: Math.max(0, Math.min(2880, Number(cookMinutes) || 0)),
      servings: Math.max(1, Math.min(100, Number(servings) || 4)),
      authorName: (authorName.trim() || 'Familielid').slice(0, 100),
      coverImage: coverImage.slice(0, 350000),
      extraImages: extraImages.slice(0, 3).map((img) => img.slice(0, 250000)),
      videoUrl: videoUrl.trim().slice(0, 600),
      videoTitle: videoTitle.trim().slice(0, 160),
      videoLocalId: videoLocalId.slice(0, 128),
      ingredients: cleanIngredients,
      steps: cleanSteps,
      notes: notes.trim().slice(0, 2000),
    };

    setSaving(true);
    try {
      await onSave(payload, initialRecipe?.id);
      onClose();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Opslaan mislukt. Controleer je invoer en probeer opnieuw.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/55 backdrop-blur-[2px] overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recipe-editor-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="min-h-full flex items-start justify-center p-4 sm:p-8">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-4xl bg-white border border-zinc-200 rounded-2xl overflow-hidden my-4"
        >
          {/* Sticky Editor Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-6 py-4 bg-white/95 backdrop-blur-sm border-b border-zinc-200">
            <h2
              id="recipe-editor-title"
              className="font-editorial text-xl font-semibold text-zinc-950"
            >
              {initialRecipe ? 'Recept bewerken' : 'Nieuw familierecept toevoegen'}
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-950 rounded-lg transition-colors whitespace-nowrap"
              >
                Annuleren
              </button>
              <button
                type="submit"
                disabled={saving || uploadingPhoto || uploadingVideo}
                className="px-4 py-2 text-xs font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {saving ? 'Opslaan...' : initialRecipe ? 'Wijzigingen opslaan' : 'Recept opslaan'}
              </button>
            </div>
          </div>

          <div className="p-6 sm:p-8 space-y-10">
            {errorMessage && (
              <div className="p-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl">
                {errorMessage}
              </div>
            )}

            {/* Section 1: Photos */}
            <section className="space-y-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-editorial text-lg font-semibold text-zinc-900">
                  01. Foto&apos;s van het gerecht
                </h3>
                <span className="text-xs text-zinc-500">
                  Worden automatisch geoptimaliseerd voor opslag en PDF-drukwerk
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Cover photo uploader */}
                <div className="md:col-span-7">
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCoverUpload}
                    className="hidden"
                  />
                  {coverImage ? (
                    <div className="relative aspect-[4/3] rounded-xl overflow-hidden border border-zinc-200 bg-zinc-100">
                      <RecipeImage
                        src={coverImage}
                        alt="Hoofdfoto voorbeeld"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-3 right-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => coverInputRef.current?.click()}
                          className="px-3 py-1.5 text-xs font-medium bg-white/95 text-zinc-900 border border-zinc-200 rounded-lg hover:bg-white transition-colors"
                        >
                          Vervang foto
                        </button>
                        <button
                          type="button"
                          onClick={() => setCoverImage('')}
                          className="p-1.5 bg-white/95 text-zinc-700 hover:text-red-600 border border-zinc-200 rounded-lg transition-colors"
                          aria-label="Hoofdfoto verwijderen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => coverInputRef.current?.click()}
                      disabled={uploadingPhoto}
                      className="w-full aspect-[4/3] rounded-xl border border-dashed border-zinc-300 bg-zinc-50 hover:bg-zinc-100/80 transition-colors flex flex-col items-center justify-center gap-2 p-6 text-center"
                    >
                      <ImagePlus className="w-7 h-7 text-zinc-400" strokeWidth={1.5} />
                      <span className="text-sm font-medium text-zinc-800">
                        {uploadingPhoto ? 'Foto verwerken...' : 'Hoofdfoto opladen'}
                      </span>
                      <span className="text-xs text-zinc-500">
                        JPG, PNG of WebP — ideaal in liggend formaat (4:3)
                      </span>
                    </button>
                  )}
                </div>

                {/* Extra photos (max 3) */}
                <div className="md:col-span-5 flex flex-col justify-between gap-3">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-zinc-700">
                      Extra bereidingsfoto&apos;s ({extraImages.length}/3)
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {extraImages.map((img, idx) => (
                        <div
                          key={idx}
                          className="relative aspect-square rounded-lg overflow-hidden border border-zinc-200 bg-zinc-100"
                        >
                          <RecipeImage
                            src={img}
                            alt={`Extra foto ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setExtraImages((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="absolute top-1 right-1 w-6 h-6 rounded-md bg-white/90 text-zinc-700 hover:text-red-600 flex items-center justify-center"
                            aria-label="Extra foto verwijderen"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {extraImages.length < 3 && (
                        <button
                          type="button"
                          onClick={() => extraInputRef.current?.click()}
                          disabled={uploadingPhoto}
                          className="aspect-square rounded-lg border border-dashed border-zinc-300 bg-zinc-50 hover:bg-zinc-100 flex flex-col items-center justify-center gap-1 text-zinc-500 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          <span className="text-[11px]">Foto</span>
                        </button>
                      )}
                    </div>
                    <input
                      ref={extraInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleExtraPhotoUpload}
                      className="hidden"
                    />
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    Voeg optioneel extra foto&apos;s toe van tussenstappen, ingrediënten of een gezellige tafelsetting.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 2: Core Details */}
            <section className="space-y-4 pt-6 border-t border-zinc-200">
              <h3 className="font-editorial text-lg font-semibold text-zinc-900">
                02. Basisgegevens &amp; familieverhaal
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="rec-title" className="block text-xs font-medium text-zinc-700 mb-1">
                    Titel van het recept *
                  </label>
                  <input
                    id="rec-title"
                    type="text"
                    required
                    maxLength={140}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Bijv. Vlaams stoofvlees van opa Jef"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]/20 focus:border-[#14532D]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="rec-subtitle" className="block text-xs font-medium text-zinc-700 mb-1">
                    Korte omschrijving
                  </label>
                  <input
                    id="rec-subtitle"
                    type="text"
                    maxLength={220}
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder="Bijv. Langzaam gegaard in donker abdijbier met peperkoek"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]/20 focus:border-[#14532D]"
                  />
                </div>

                <div>
                  <label htmlFor="rec-category" className="block text-xs font-medium text-zinc-700 mb-1">
                    Hoofdstuk / Categorie
                  </label>
                  <select
                    id="rec-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as RecipeCategory)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]/20 focus:border-[#14532D]"
                  >
                    {RECIPE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="rec-author" className="block text-xs font-medium text-zinc-700 mb-1">
                    Van wie is dit recept? *
                  </label>
                  <input
                    id="rec-author"
                    type="text"
                    required
                    maxLength={100}
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    placeholder="Bijv. Oma Maria, Papa, Sofie"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]/20 focus:border-[#14532D]"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3 sm:col-span-2">
                  <div>
                    <label htmlFor="rec-prep" className="block text-xs font-medium text-zinc-700 mb-1">
                      Voorbereiding (min)
                    </label>
                    <input
                      id="rec-prep"
                      type="number"
                      min={0}
                      max={1440}
                      value={prepMinutes}
                      onChange={(e) => setPrepMinutes(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]/20 focus:border-[#14532D]"
                    />
                  </div>
                  <div>
                    <label htmlFor="rec-cook" className="block text-xs font-medium text-zinc-700 mb-1">
                      Bereiding (min)
                    </label>
                    <input
                      id="rec-cook"
                      type="number"
                      min={0}
                      max={2880}
                      value={cookMinutes}
                      onChange={(e) => setCookMinutes(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]/20 focus:border-[#14532D]"
                    />
                  </div>
                  <div>
                    <label htmlFor="rec-servings" className="block text-xs font-medium text-zinc-700 mb-1">
                      Aantal personen
                    </label>
                    <input
                      id="rec-servings"
                      type="number"
                      min={1}
                      max={100}
                      value={servings}
                      onChange={(e) => setServings(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]/20 focus:border-[#14532D]"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="rec-story" className="block text-xs font-medium text-zinc-700 mb-1">
                    Verhaal achter het recept (voor in het kookboek)
                  </label>
                  <textarea
                    id="rec-story"
                    rows={3}
                    maxLength={3000}
                    value={story}
                    onChange={(e) => setStory(e.target.value)}
                    placeholder="Waar komt dit gerecht vandaan? Wanneer maken jullie het meestal?"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]/20 focus:border-[#14532D]"
                  />
                </div>
              </div>
            </section>

            {/* Section 3: Ingredients with Preparation & Vers / Proviandkast split */}
            <section className="space-y-4 pt-6 border-t border-zinc-200">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-editorial text-lg font-semibold text-zinc-900">
                  03. Ingrediënten, voorbereiding &amp; opslagcategorie
                </h3>
                <span className="text-xs text-zinc-500">
                  Opmaak in recept &amp; PDF:{' '}
                  <strong className="font-bold text-zinc-900">3 stuks Grote uien,</strong>{' '}
                  <span className="font-normal text-zinc-700">grof gesneden</span>
                </span>
              </div>

              {/* Column headers on desktop */}
              <div className="hidden md:grid md:grid-cols-[72px_84px_1.1fr_1.35fr_104px_32px] gap-2 px-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500">
                <span>Hoev.</span>
                <span>Eenheid</span>
                <span>Ingrediënt</span>
                <span>Voorbereiding (vrije tekst)</span>
                <span>Categorie</span>
                <span />
              </div>

              <div className="space-y-2.5">
                {ingredients.map((ing) => (
                  <div
                    key={ing.id}
                    className="grid grid-cols-12 md:grid-cols-[72px_84px_1.1fr_1.35fr_104px_32px] gap-2 items-center"
                  >
                    <input
                      type="text"
                      value={ing.amount}
                      onChange={(e) => updateIngredient(ing.id, { amount: e.target.value })}
                      maxLength={40}
                      placeholder="400"
                      aria-label="Hoeveelheid"
                      className="col-span-4 md:col-span-1 px-2.5 py-2 text-sm font-mono tabular-nums bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                    />
                    <input
                      type="text"
                      value={ing.unit}
                      onChange={(e) => updateIngredient(ing.id, { unit: e.target.value })}
                      maxLength={40}
                      placeholder="g / el"
                      aria-label="Eenheid"
                      className="col-span-4 md:col-span-1 px-2.5 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                    />
                    <input
                      type="text"
                      value={ing.name}
                      onChange={(e) => updateIngredient(ing.id, { name: e.target.value })}
                      maxLength={150}
                      placeholder="Ingrediënt (bijv. grote uien)"
                      aria-label="Ingrediënt"
                      className="col-span-12 md:col-span-1 px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                    />
                    <input
                      type="text"
                      value={ing.preparation || ''}
                      onChange={(e) => updateIngredient(ing.id, { preparation: e.target.value })}
                      maxLength={160}
                      placeholder="Voorbereiding (bijv. in blokjes gesneden, in reepjes)"
                      aria-label="Voorbereiding"
                      className="col-span-12 md:col-span-1 px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                    />
                    <select
                      value={ing.storageCategory}
                      onChange={(e) =>
                        updateIngredient(
                          ing.id,
                          { storageCategory: e.target.value as StorageCategory },
                          true
                        )
                      }
                      aria-label="Opslagcategorie"
                      className="col-span-10 md:col-span-1 px-2.5 py-2 text-xs font-medium bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                    >
                      {(Object.keys(STORAGE_CATEGORY_META) as StorageCategory[]).map((key) => (
                        <option key={key} value={key}>
                          {STORAGE_CATEGORY_META[key].shortLabel}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setIngredients((prev) =>
                          prev.length > 1 ? prev.filter((item) => item.id !== ing.id) : prev
                        )
                      }
                      className="col-span-2 md:col-span-1 h-9 flex items-center justify-center text-zinc-400 hover:text-red-600 rounded-lg transition-colors"
                      aria-label="Ingrediënt verwijderen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  setIngredients((prev) => (prev.length < 60 ? [...prev, makeIngredient()] : prev))
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-800 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Ingrediënt toevoegen
              </button>
            </section>

            {/* Section 4: Steps */}
            <section className="space-y-4 pt-6 border-t border-zinc-200">
              <h3 className="font-editorial text-lg font-semibold text-zinc-900">
                04. Bereidingsstappen
              </h3>

              <div className="space-y-3">
                {steps.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-2.5">
                    <span className="font-mono text-xs font-medium text-[#14532D] pt-3 w-6 shrink-0 tabular-nums">
                      {String(idx + 1).padStart(2, '0')}.
                    </span>
                    <textarea
                      rows={2}
                      maxLength={1500}
                      value={step}
                      onChange={(e) =>
                        setSteps((prev) => prev.map((s, i) => (i === idx ? e.target.value : s)))
                      }
                      placeholder={`Beschrijf stap ${idx + 1}...`}
                      className="flex-1 px-3.5 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]/20 focus:border-[#14532D]"
                    />
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveStep(idx, -1)}
                        disabled={idx === 0}
                        className="p-1 text-zinc-400 hover:text-zinc-800 disabled:opacity-30"
                        aria-label="Stap omhoog"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStep(idx, 1)}
                        disabled={idx === steps.length - 1}
                        className="p-1 text-zinc-400 hover:text-zinc-800 disabled:opacity-30"
                        aria-label="Stap omlaag"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSteps((prev) =>
                            prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev
                          )
                        }
                        className="p-1 text-zinc-400 hover:text-red-600"
                        aria-label="Stap verwijderen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setSteps((prev) => (prev.length < 40 ? [...prev, ''] : prev))}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-800 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Stap toevoegen
              </button>
            </section>

            {/* Section 5: Notes & Optional Video */}
            <section className="space-y-5 pt-6 border-t border-zinc-200">
              <h3 className="font-editorial text-lg font-semibold text-zinc-900">
                05. Extra opmerkingen &amp; optionele kookvideo
              </h3>

              <div>
                <label htmlFor="rec-notes" className="block text-xs font-medium text-zinc-700 mb-1">
                  Kooktips, bewaaradvies of variaties
                </label>
                <textarea
                  id="rec-notes"
                  rows={3}
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Bijv. Nog lekkerder een dag later, of serveer met vers brood..."
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]/20 focus:border-[#14532D]"
                />
              </div>

              <div className="p-5 bg-zinc-50 border border-zinc-200 rounded-xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-[#14532D]" />
                    <span className="text-sm font-semibold text-zinc-900">
                      Kookvideo toevoegen (optioneel)
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    Wordt automatisch uitgesloten bij PDF-export
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="rec-video-title" className="block text-xs font-medium text-zinc-700 mb-1">
                      Titel bij video
                    </label>
                    <input
                      id="rec-video-title"
                      type="text"
                      maxLength={160}
                      value={videoTitle}
                      onChange={(e) => setVideoTitle(e.target.value)}
                      placeholder="Bijv. Oma toont hoe ze het deeg vlecht"
                      className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                    />
                  </div>
                  <div>
                    <label htmlFor="rec-video-url" className="block text-xs font-medium text-zinc-700 mb-1">
                      YouTube, Vimeo of directe MP4-link
                    </label>
                    <input
                      id="rec-video-url"
                      type="url"
                      maxLength={600}
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-[#14532D]"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-200">
                  <div className="text-xs text-zinc-600">
                    {videoLocalId ? (
                      <span className="font-medium text-[#14532D]">
                        Lokale video gekoppeld{videoFileName ? `: ${videoFileName}` : ''}
                      </span>
                    ) : (
                      <span>Of laad een eigen kookvideo op vanaf je toestel (.mp4, .mov, .webm)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {videoLocalId && (
                      <button
                        type="button"
                        onClick={() => {
                          setVideoLocalId('');
                          setVideoFileName('');
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        Video ontkoppelen
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => videoInputRef.current?.click()}
                      disabled={uploadingVideo}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-zinc-800 bg-white border border-zinc-200 hover:bg-zinc-100 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {uploadingVideo ? 'Opladen...' : 'Videobestand kiezen'}
                    </button>
                    <input
                      ref={videoInputRef}
                      type="file"
                      accept="video/*"
                      onChange={handleLocalVideoUpload}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </form>
      </div>
    </div>
  );
}
