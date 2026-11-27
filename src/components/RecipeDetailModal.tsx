import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  Check,
  FileDown,
  MessageSquare,
  Minus,
  Pencil,
  Play,
  Plus,
  ShoppingBasket,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { Recipe, RecipeComment, STORAGE_CATEGORY_META } from '../types';
import { scaleAmountString } from '../utils/ingredientCategorizer';
import { getLocalVideoUrl, parseVideoUrl } from '../utils/mediaStorage';
import { generateCookbookPdf } from '../utils/pdfCookbook';
import {
  formatIngredientParts,
  isStepOptional,
  splitFirstSentence,
} from '../utils/recipeFormatting';
import { RecipeImage } from './RecipeImage';

interface RecipeDetailModalProps {
  recipe: Recipe;
  comments: RecipeComment[];
  isInShoppingList: boolean;
  defaultAuthorName: string;
  onClose: () => void;
  onEdit: (recipe: Recipe) => void;
  onDelete: (recipeId: string) => Promise<void>;
  onToggleShopping: (recipe: Recipe, servings: number) => void;
  onAddComment: (recipeId: string, authorName: string, text: string) => Promise<void>;
  onDeleteComment: (recipeId: string, commentId: string) => Promise<void>;
}

function formatShortDate(ms: number): string {
  try {
    return new Intl.DateTimeFormat('nl-BE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(ms));
  } catch {
    return '';
  }
}

function formatDurationDutch(minutes: number): string {
  if (!minutes || minutes <= 0) return '0 minuten';
  if (minutes < 60) return `${minutes} minuten`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} uur` : `${h} uur en ${m} minuten`;
}

export function RecipeDetailModal({
  recipe,
  comments,
  isInShoppingList,
  defaultAuthorName,
  onClose,
  onEdit,
  onDelete,
  onToggleShopping,
  onAddComment,
  onDeleteComment,
}: RecipeDetailModalProps) {
  const [servings, setServings] = useState(recipe.servings);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [localVideoObjectUrl, setLocalVideoObjectUrl] = useState<string | null>(null);
  const [commentAuthor, setCommentAuthor] = useState(defaultAuthorName || 'Familielid');
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const photoPlateRef = useRef<HTMLElement>(null);

  const photos = [recipe.coverImage, ...recipe.extraImages].filter(Boolean);
  const hasExtraPhotos = recipe.extraImages.filter(Boolean).length > 0;
  const ratio = recipe.servings > 0 ? servings / recipe.servings : 1;
  const parsedVideo = parseVideoUrl(recipe.videoUrl);
  const hasVideo = Boolean(parsedVideo || recipe.videoLocalId);

  const photoReferenceLabel =
    photos.length === 0
      ? ''
      : photos.length === 1
        ? 'Foto op bladzijde 2'
        : hasExtraPhotos && recipe.coverImage
          ? "Foto's op bladzijde 2–3"
          : "Foto's op bladzijde 2";

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let revokedUrl: string | null = null;
    let active = true;
    if (recipe.videoLocalId) {
      void getLocalVideoUrl(recipe.videoLocalId).then((url) => {
        if (!active) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        revokedUrl = url;
        setLocalVideoObjectUrl(url);
      });
    } else {
      setLocalVideoObjectUrl(null);
    }
    return () => {
      active = false;
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
    };
  }, [recipe.videoLocalId]);

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !commentAuthor.trim()) return;
    setSubmittingComment(true);
    try {
      await onAddComment(
        recipe.id,
        commentAuthor.trim().slice(0, 100),
        commentText.trim().slice(0, 1500)
      );
      setCommentText('');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleExportSinglePdf = async () => {
    setExportingPdf(true);
    try {
      await generateCookbookPdf(
        [recipe],
        { [recipe.id]: comments },
        {
          title: recipe.title,
          subtitle: recipe.subtitle,
          familyName: 'Aan Tafel! Receptblad',
          includeCover: false,
          includeToc: false,
          includePhotos: true,
          photoOnOppositePage: true,
          includeComments: true,
          includeRegister: false,
          selectedRecipeIds: [recipe.id],
        }
      );
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/55 backdrop-blur-[2px] overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recipe-detail-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="min-h-full flex items-start justify-center p-3 sm:p-8">
        <article className="w-full max-w-4xl bg-white border border-zinc-200 rounded-2xl overflow-hidden my-3 font-sans text-[#121212]">
          {/* Minimal Sticky Utility Bar */}
          <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-5 sm:px-8 py-3.5 bg-white/95 backdrop-blur-sm border-b border-zinc-200">
            <div className="flex items-center gap-2 text-xs text-zinc-500 truncate">
              <span className="uppercase tracking-[0.12em] font-semibold text-[#121212]">
                {recipe.category}
              </span>
              <span aria-hidden="true">·</span>
              <span className="truncate">Door {recipe.authorName}</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onToggleShopping(recipe, servings)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isInShoppingList
                    ? 'bg-[#14532D] text-white hover:bg-[#166534]'
                    : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
                }`}
              >
                {isInShoppingList ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <ShoppingBasket className="w-3.5 h-3.5" />
                )}
                {isInShoppingList ? 'Op boodschappenlijst' : 'Naar boodschappen'}
              </button>

              <button
                type="button"
                onClick={handleExportSinglePdf}
                disabled={exportingPdf}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-800 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" />
                {exportingPdf ? 'PDF maken...' : 'PDF'}
              </button>

              <button
                type="button"
                onClick={() => onEdit(recipe)}
                className="inline-flex items-center justify-center w-9 h-9 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                title="Recept bewerken"
                aria-label="Recept bewerken"
              >
                <Pencil className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center w-9 h-9 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                aria-label="Sluiten"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-6 sm:p-11 space-y-10">
            {/* Editorial PDF-Aligned Recipe Sheet */}
            <section className="space-y-6">
              {/* Top-left uppercase chapter kicker + bold clean title */}
              <header className="space-y-3">
                <div className="flex items-center justify-between gap-4 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                  <span>{recipe.category}</span>
                  <span>Recept van {recipe.authorName}</span>
                </div>
                <h1
                  id="recipe-detail-title"
                  className="text-3xl sm:text-[34px] font-bold tracking-tight text-[#121212] leading-[1.12] pt-1"
                >
                  {recipe.title}
                </h1>
              </header>

              {/* Single Razor-Thin Hairline Separating Header from Asymmetric 2-Column Body */}
              <div className="border-t border-zinc-300 pt-7 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
                {/* Left Narrow Borderless Column: Timings + Bold/Normal Ingredients */}
                <div className="lg:col-span-4 space-y-6">
                  {/* Servings + Timings matching PDF left column */}
                  <div className="space-y-2 text-[13px] leading-snug">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-[#121212]">
                        Voor {servings} {servings === 1 ? 'persoon' : 'personen'}
                      </p>
                      <div className="inline-flex items-center gap-0.5 p-0.5 bg-zinc-100 rounded-md">
                        <button
                          type="button"
                          onClick={() => setServings((s) => Math.max(1, s - 1))}
                          className="w-6 h-6 flex items-center justify-center rounded text-zinc-700 hover:bg-white transition-colors cursor-pointer"
                          aria-label="Minder personen"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setServings((s) => Math.min(100, s + 1))}
                          className="w-6 h-6 flex items-center justify-center rounded text-zinc-700 hover:bg-white transition-colors cursor-pointer"
                          aria-label="Meer personen"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-0.5 text-zinc-600 tabular-nums">
                      <p>Voorbereiden: {formatDurationDutch(recipe.prepMinutes)}</p>
                      <p>Bereiden: {formatDurationDutch(recipe.cookMinutes)}</p>
                    </div>
                  </div>

                  {/* Borderless Hanging-Indent Ingredients: **<hoeveelheid> <ingrediënt>,** <voorbereiding> — optional in (...) */}
                  <ul className="space-y-2 text-[13.5px] leading-[1.45]">
                    {recipe.ingredients.map((ing) => {
                      const scaled = scaleAmountString(ing.amount, ratio);
                      const { boldPart, prepPart, optional } = formatIngredientParts(ing, scaled);
                      const catMeta = STORAGE_CATEGORY_META[ing.storageCategory];

                      return (
                        <li
                          key={ing.id}
                          className="flex items-baseline justify-between gap-2"
                        >
                          <div className="pl-3 -indent-3 min-w-0">
                            {optional && <span className="font-normal text-zinc-700">(</span>}
                            <span className="font-bold text-[#121212]">{boldPart}</span>
                            {prepPart && (
                              <span className="font-normal text-zinc-700"> {prepPart}</span>
                            )}
                            {optional && <span className="font-normal text-zinc-700">)</span>}
                          </div>
                          <span
                            className={`text-[10px] font-medium uppercase tracking-[0.04em] opacity-75 whitespace-nowrap shrink-0 ${catMeta.accentText}`}
                            title={catMeta.label}
                          >
                            {catMeta.shortLabel}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Right Wider Column: Strictly Italic History/Intro + Bold First-Sentence Steps + Bottom Photo Reference */}
                <div className="lg:col-span-8 space-y-6 text-[15px] leading-[1.7] text-[#121212]">
                  {/* Strictly Italic Intro & Dish History */}
                  {(recipe.subtitle || recipe.story) && (
                    <div className="italic text-[#18181B] space-y-3">
                      {recipe.subtitle && <p className="italic">{recipe.subtitle}</p>}
                      {recipe.story && (
                        <p className="italic whitespace-pre-line">{recipe.story}</p>
                      )}
                    </div>
                  )}

                  {/* Numbered Preparation Steps: Bold first sentence, optional steps in (...) */}
                  <ol className="space-y-4">
                    {recipe.steps.map((step, index) => {
                      const { firstSentence, rest } = splitFirstSentence(step);
                      const optional = isStepOptional(recipe.optionalStepIndices, index);

                      return (
                        <li key={index}>
                          <strong className="font-bold text-[#121212] mr-1.5">
                            {index + 1}.
                          </strong>
                          {optional && <span>(</span>}
                          <strong className="font-bold text-[#121212]">{firstSentence}</strong>
                          {rest && <span> {rest}</span>}
                          {optional && <span>)</span>}
                        </li>
                      );
                    })}
                  </ol>

                  {/* Italic Kooktip / Notes */}
                  {recipe.notes && (
                    <div className="pt-2">
                      <div className="w-8 border-t border-zinc-300 mb-3" />
                      <p className="italic text-[14px] text-zinc-700 leading-relaxed whitespace-pre-line">
                        {recipe.notes}
                      </p>
                    </div>
                  )}

                  {/* Bottom Photo Page Reference (matches PDF & scrolls to photo plate) */}
                  {photos.length > 0 && (
                    <div className="pt-3">
                      <div className="w-8 border-t border-zinc-300 mb-2.5" />
                      <button
                        type="button"
                        onClick={() =>
                          photoPlateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }
                        className="inline-flex items-center gap-1.5 text-[13px] italic text-zinc-600 hover:text-[#121212] transition-colors cursor-pointer"
                      >
                        <span>{photoReferenceLabel}</span>
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Subtle Book Page Number Footer */}
              <div className="pt-4 flex items-center justify-between text-[11px] text-zinc-400 tabular-nums border-t border-zinc-100">
                <span>1</span>
                <span>{recipe.category}</span>
              </div>
            </section>

            {/* Opposite-Page Style Photograph Plate */}
            {photos.length > 0 && (
              <section
                ref={photoPlateRef}
                className="pt-8 border-t border-zinc-200 space-y-4"
              >
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                  <span className="normal-case italic tracking-normal text-zinc-500">
                    {photos.length === 1 ? 'Gerechtfoto' : `Gerechtfoto's (${photos.length})`}
                  </span>
                  <span>{recipe.category}</span>
                </div>

                <div className="aspect-[16/10] w-full overflow-hidden bg-zinc-100 border border-zinc-200">
                  <RecipeImage
                    src={photos[activePhotoIndex] || photos[0]}
                    alt={recipe.title}
                    fallbackTitle={recipe.title}
                    className="w-full h-full object-cover"
                  />
                </div>

                {photos.length > 1 && (
                  <div className="flex items-center gap-3 overflow-x-auto pb-1">
                    {photos.map((photo, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActivePhotoIndex(idx)}
                        className={`relative w-24 h-16 overflow-hidden border transition-all shrink-0 cursor-pointer ${
                          idx === activePhotoIndex
                            ? 'border-[#121212] ring-2 ring-zinc-900/15'
                            : 'border-zinc-200 opacity-75 hover:opacity-100'
                        }`}
                      >
                        <RecipeImage
                          src={photo}
                          alt={`${recipe.title} foto ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-zinc-400 tabular-nums">
                  <span className="italic text-zinc-500">{recipe.title}</span>
                  <span>2</span>
                </div>
              </section>
            )}

            {/* Optional Video Section (Explicitly excluded from PDF) */}
            {hasVideo && (
              <section className="pt-8 border-t border-zinc-200 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-[#14532D]" />
                    <h2 className="text-lg font-bold text-[#121212]">
                      {recipe.videoTitle || 'Kookvideo'}
                    </h2>
                  </div>
                  <span className="text-xs text-zinc-500">
                    Alleen digitaal — wordt automatisch weggelaten in het PDF-kookboek
                  </span>
                </div>

                {localVideoObjectUrl ? (
                  <div className="rounded-xl overflow-hidden bg-zinc-950 border border-zinc-200">
                    <video
                      src={localVideoObjectUrl}
                      controls
                      className="w-full max-h-[460px] mx-auto"
                    />
                  </div>
                ) : parsedVideo && (parsedVideo.kind === 'youtube' || parsedVideo.kind === 'vimeo') ? (
                  <div className="aspect-video w-full rounded-xl overflow-hidden bg-zinc-950 border border-zinc-200">
                    <iframe
                      src={parsedVideo.embedUrl}
                      title={recipe.videoTitle || recipe.title}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : parsedVideo && parsedVideo.kind === 'direct' ? (
                  <div className="rounded-xl overflow-hidden bg-zinc-950 border border-zinc-200">
                    <video src={parsedVideo.embedUrl} controls className="w-full max-h-[460px]" />
                  </div>
                ) : recipe.videoLocalId ? (
                  <div className="p-5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-600 flex items-center gap-3">
                    <Play className="w-4 h-4 text-zinc-400 shrink-0" />
                    <span>
                      Deze video is lokaal opgeladen op het apparaat waarmee het recept werd aangemaakt.
                      Voeg een YouTube- of Vimeo-link toe om hem op elk familie-apparaat te bekijken.
                    </span>
                  </div>
                ) : parsedVideo ? (
                  <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-700">
                    Video-link:{' '}
                    <a
                      href={parsedVideo.embedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#14532D] underline"
                    >
                      {parsedVideo.embedUrl}
                    </a>
                  </div>
                ) : null}
              </section>
            )}

            {/* Family Comments & Notes */}
            <section className="pt-8 border-t border-zinc-200 space-y-6">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#14532D]" />
                  <h2 className="text-lg font-bold text-[#121212]">
                    Familienotities ({comments.length})
                  </h2>
                </div>
                <span className="text-xs text-zinc-500">
                  Optioneel mee af te drukken in het PDF-kookboek
                </span>
              </div>

              {comments.length > 0 ? (
                <ul className="divide-y divide-zinc-200 border-t border-b border-zinc-200">
                  {comments.map((cmt) => (
                    <li key={cmt.id} className="py-4 flex items-start justify-between gap-4">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          <span className="font-semibold text-zinc-900">{cmt.authorName}</span>
                          {cmt.createdAtMs > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{formatShortDate(cmt.createdAtMs)}</span>
                            </>
                          )}
                        </div>
                        <p className="text-sm italic text-zinc-700 leading-6 whitespace-pre-line">
                          {cmt.text}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteComment(recipe.id, cmt.id)}
                        className="p-1.5 text-zinc-400 hover:text-red-600 rounded-md transition-colors shrink-0 cursor-pointer"
                        title="Notitie verwijderen"
                        aria-label="Notitie verwijderen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">
                  Nog geen familienotities. Schrijf hieronder een kooktip, variatie of herinnering bij dit gerecht.
                </p>
              )}

              {/* Add Comment Form */}
              <form
                onSubmit={handleCommentSubmit}
                className="space-y-3 bg-zinc-50 border border-zinc-200 rounded-xl p-5"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label
                      htmlFor="comment-author"
                      className="block text-xs font-medium text-zinc-700 mb-1"
                    >
                      Jouw naam
                    </label>
                    <input
                      id="comment-author"
                      type="text"
                      value={commentAuthor}
                      onChange={(e) => setCommentAuthor(e.target.value)}
                      maxLength={100}
                      placeholder="Bijv. Mama, Pieter, Oma"
                      required
                      className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]/20 focus:border-[#14532D]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="comment-text"
                      className="block text-xs font-medium text-zinc-700 mb-1"
                    >
                      Opmerking, tip of herinnering
                    </label>
                    <input
                      id="comment-text"
                      type="text"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      maxLength={1500}
                      placeholder="Bijv. Extra snufje nootmuskaat werkt geweldig..."
                      required
                      className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14532D]/20 focus:border-[#14532D]"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingComment || !commentText.trim()}
                    className="px-4 py-2 text-xs font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 cursor-pointer"
                  >
                    {submittingComment ? 'Opslaan...' : 'Notitie toevoegen'}
                  </button>
                </div>
              </form>
            </section>

            {/* Danger zone / delete confirmation */}
            <footer className="pt-6 border-t border-zinc-200 flex items-center justify-between gap-4">
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-red-700 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Recept verwijderen
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-red-700 font-medium">
                    Zeker weten dat je dit recept wilt verwijderen?
                  </span>
                  <button
                    type="button"
                    onClick={() => onDelete(recipe.id)}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Ja, verwijderen
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1.5 text-xs font-medium text-zinc-700 hover:text-zinc-900 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Annuleren
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-zinc-700 hover:text-zinc-950 transition-colors whitespace-nowrap cursor-pointer"
              >
                Sluiten
              </button>
            </footer>
          </div>
        </article>
      </div>
    </div>
  );
}
