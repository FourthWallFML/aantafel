import { jsPDF } from 'jspdf';
import {
  CookbookPdfSettings,
  ManualShoppingItem,
  Recipe,
  RecipeComment,
  STORAGE_CATEGORY_META,
  StorageCategory,
} from '../types';
import { AggregatedGroceryItem, normalizeIngredientKey } from './ingredientCategorizer';
import { formatIngredientParts, isStepOptional, splitFirstSentence } from './recipeFormatting';

async function loadImageAsJpegDataUrl(
  src: string,
  targetAspect?: number
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (!src) return null;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Image load failed'));
      image.src = src;
    });

    // Center-crop to target aspect ratio if requested (e.g., full-page portrait photo plate)
    let sx = 0;
    let sy = 0;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;

    if (targetAspect && sw > 0 && sh > 0) {
      const naturalAspect = sw / sh;
      if (naturalAspect > targetAspect) {
        sw = Math.round(sh * targetAspect);
        sx = Math.round((img.naturalWidth - sw) / 2);
      } else {
        sh = Math.round(sw / targetAspect);
        sy = Math.round((img.naturalHeight - sh) / 2);
      }
    }

    const maxW = 1200;
    const scale = sw > maxW ? maxW / sw : 1;
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.86),
      width: w,
      height: h,
    };
  } catch {
    return null;
  }
}

function formatDateNl(ms: number): string {
  try {
    return new Intl.DateTimeFormat('nl-BE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(ms));
  } catch {
    return '';
  }
}

function formatDurationDutch(minutes: number): string {
  if (!minutes || minutes <= 0) return '0 minuten';
  if (minutes < 60) return `${minutes} minuten`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return `${hours} uur`;
  return `${hours} uur en ${rem} minuten`;
}

function sanitizeFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'familiekookboek'
  );
}

interface StyledToken {
  text: string;
  bold: boolean;
  spaceBefore: boolean;
  softColor?: boolean;
}

/**
 * Splits styled tokens into wrapped lines, keeping adjacent spaceBefore=false tokens
 * (such as opening/closing parentheses around optional items) attached to their neighbor word.
 */
function layoutStyledTokens(
  doc: jsPDF,
  tokens: StyledToken[],
  maxWidth: number,
  hangingIndent: number,
  fontSize: number
): StyledToken[][] {
  if (tokens.length === 0) return [];

  // Group indivisible clusters (tokens with spaceBefore=false stay attached to preceding token)
  const clusters: StyledToken[][] = [];
  for (const tok of tokens) {
    if (clusters.length === 0 || tok.spaceBefore) {
      clusters.push([tok]);
    } else {
      clusters[clusters.length - 1].push(tok);
    }
  }

  doc.setFontSize(fontSize);
  doc.setFont('helvetica', 'normal');
  const spaceW = doc.getTextWidth(' ');

  const measureCluster = (cluster: StyledToken[]) => {
    let w = 0;
    for (const tok of cluster) {
      doc.setFont('helvetica', tok.bold ? 'bold' : 'normal');
      w += doc.getTextWidth(tok.text);
    }
    return w;
  };

  const lines: StyledToken[][] = [];
  let currentLine: StyledToken[] = [];
  let currentW = 0;

  const lineLimit = () => (lines.length === 0 ? maxWidth : maxWidth - hangingIndent);

  for (const cluster of clusters) {
    const w = measureCluster(cluster);
    const needed = currentLine.length === 0 ? w : spaceW + w;
    if (currentLine.length > 0 && currentW + needed > lineLimit()) {
      lines.push(currentLine);
      currentLine = cluster.map((t, i) => (i === 0 ? { ...t, spaceBefore: false } : t));
      currentW = w;
    } else {
      if (currentLine.length === 0) {
        currentLine = cluster.map((t, i) => (i === 0 ? { ...t, spaceBefore: false } : t));
      } else {
        currentLine.push(...cluster);
      }
      currentW += needed;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

function drawStyledLines(
  doc: jsPDF,
  lines: StyledToken[][],
  x: number,
  startY: number,
  hangingIndent: number,
  fontSize: number,
  lineHeight: number,
  inkBlack: [number, number, number],
  inkSoft: [number, number, number]
): number {
  doc.setFontSize(fontSize);
  doc.setFont('helvetica', 'normal');
  const spaceW = doc.getTextWidth(' ');

  let y = startY;
  lines.forEach((lineTokens, lineIdx) => {
    let cursorX = x + (lineIdx === 0 ? 0 : hangingIndent);
    lineTokens.forEach((tok, tokIdx) => {
      if (tokIdx > 0 && tok.spaceBefore) {
        cursorX += spaceW;
      }
      doc.setFont('helvetica', tok.bold ? 'bold' : 'normal');
      doc.setFontSize(fontSize);
      doc.setTextColor(...(tok.softColor ? inkSoft : inkBlack));
      doc.text(tok.text, cursorX, y);
      cursorX += doc.getTextWidth(tok.text);
    });
    y += lineHeight;
  });

  return y;
}

function buildIngredientTokens(
  boldPart: string,
  prepPart: string,
  optional: boolean
): StyledToken[] {
  const tokens: StyledToken[] = [];
  const boldWords = boldPart.trim().split(/\s+/).filter(Boolean);
  const prepWords = prepPart.trim().split(/\s+/).filter(Boolean);
  if (boldWords.length === 0 && prepWords.length === 0) return tokens;

  if (optional) {
    tokens.push({ text: '(', bold: false, spaceBefore: false, softColor: true });
  }

  boldWords.forEach((word, idx) => {
    tokens.push({
      text: word,
      bold: true,
      spaceBefore: idx > 0,
      softColor: false,
    });
  });

  prepWords.forEach((word, idx) => {
    tokens.push({
      text: word,
      bold: false,
      spaceBefore: boldWords.length > 0 || idx > 0,
      softColor: true,
    });
  });

  if (optional) {
    tokens.push({ text: ')', bold: false, spaceBefore: false, softColor: true });
  }

  return tokens;
}

function buildStepTokens(
  stepNumber: number,
  stepText: string,
  optional: boolean
): StyledToken[] {
  const { firstSentence, rest } = splitFirstSentence(stepText);
  if (!firstSentence && !rest) return [];

  const tokens: StyledToken[] = [
    { text: `${stepNumber}.`, bold: true, spaceBefore: false, softColor: false },
  ];

  const firstWords = firstSentence.split(/\s+/).filter(Boolean);
  const restWords = rest.split(/\s+/).filter(Boolean);

  if (optional) {
    tokens.push({ text: '(', bold: false, spaceBefore: true, softColor: false });
  }

  firstWords.forEach((word, idx) => {
    tokens.push({
      text: word,
      bold: true,
      spaceBefore: optional ? idx > 0 : true,
      softColor: false,
    });
  });

  restWords.forEach((word) => {
    tokens.push({
      text: word,
      bold: false,
      spaceBefore: true,
      softColor: false,
    });
  });

  if (optional) {
    tokens.push({ text: ')', bold: false, spaceBefore: false, softColor: false });
  }

  return tokens;
}

interface RecipeA4LayoutSolution {
  scale: number;
  leftW: number;
  rightW: number;
  gutter: number;
  titleFontSize: number;
  titleLineH: number;
  titleLines: string[];
  inlinePhotoH: number;
  ruleY: number;
  bodyStartY: number;
  servingsFontSize: number;
  metaFontSize: number;
  metaLineH: number;
  ingFontSize: number;
  ingLineH: number;
  ingGap: number;
  ingHangingIndent: number;
  introFontSize: number;
  introLineH: number;
  introParaGap: number;
  introAfterGap: number;
  stepFontSize: number;
  stepLineH: number;
  stepGap: number;
  noteFontSize: number;
  noteLineH: number;
  commentFontSize: number;
  commentLineH: number;
  refFontSize: number;
  leftHeight: number;
  rightHeight: number;
  usableHeight: number;
}

export interface RegisterEntry {
  headword: string;
  refs: { title: string; page: number }[];
}

const SKIP_INDEX_WORDS = new Set(['zout', 'peper', 'water', 'zwarte peper', 'zeezout']);

export function buildAlphabeticalRegister(
  entries: { recipe: Recipe; page: number }[]
): RegisterEntry[] {
  const map = new Map<string, Map<string, number>>();

  const addRef = (headwordRaw: string, title: string, page: number) => {
    const key = headwordRaw.trim().toLowerCase();
    if (!key || key.length < 2 || SKIP_INDEX_WORDS.has(key)) return;
    let refs = map.get(key);
    if (!refs) {
      refs = new Map<string, number>();
      map.set(key, refs);
    }
    refs.set(title, page);
  };

  for (const { recipe, page } of entries) {
    // Index by recipe title itself
    addRef(recipe.title, recipe.title, page);

    // Index by each key ingredient
    for (const ing of recipe.ingredients) {
      const normalized = normalizeIngredientKey(ing.name);
      if (normalized) {
        addRef(normalized, recipe.title, page);
      }
    }
  }

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'nl'))
    .map(([headword, refsMap]) => ({
      headword,
      refs: Array.from(refsMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0], 'nl'))
        .map(([title, page]) => ({ title, page })),
    }));
}

/**
 * Generates a print-ready A4 PDF cookbook following the crisp European editorial book style:
 * - Pure white pages, humanist sans-serif typography, pure black ink
 * - Clean 'Inhoud' page with bold chapters & bold right-aligned page numbers
 * - Recipe spread: Left page with top-left chapter kicker, bold title, single razor-thin hairline,
 *   borderless left timings + bold hanging-indent ingredients column, right italic story + inline bold steps
 * - Opposite Right page: top-right chapter kicker + large framed dish photograph
 * - 3-column alphabetical 'REGISTER' at the back with bold ingredient/recipe headwords & exact page numbers
 * - Videos are always excluded from the printed edition.
 */
export async function generateCookbookPdf(
  recipes: Recipe[],
  commentsByRecipe: Record<string, RecipeComment[]>,
  settings: CookbookPdfSettings
): Promise<void> {
  const orderedRecipes = settings.selectedRecipeIds
    .map((id) => recipes.find((r) => r.id === id))
    .filter((r): r is Recipe => Boolean(r));

  if (orderedRecipes.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 20;
  const contentWidth = pageWidth - marginX * 2; // 170mm

  const inkBlack: [number, number, number] = [18, 18, 18];
  const inkSoft: [number, number, number] = [55, 55, 58];
  const ruleGrey: [number, number, number] = [175, 175, 178];

  let hasStartedFirstPage = false;

  const startFreshPage = () => {
    if (hasStartedFirstPage) {
      doc.addPage();
    } else {
      hasStartedFirstPage = true;
    }
  };

  // Preload brand logo for frontpage + main and extra recipe photos
  const logoUrl = `${import.meta.env.BASE_URL}logo-aantafel.png`;
  const coverLogo = settings.includeCover ? await loadImageAsJpegDataUrl(logoUrl) : null;

  const photoCache = new Map<string, { dataUrl: string; width: number; height: number } | null>();
  const extraPhotosCache = new Map<string, { dataUrl: string; width: number; height: number }[]>();
  if (settings.includePhotos) {
    const plateAspect = settings.photoOnOppositePage ? 162 / 236 : 170 / 72;
    await Promise.all(
      orderedRecipes.map(async (recipe) => {
        if (recipe.coverImage) {
          const loaded = await loadImageAsJpegDataUrl(recipe.coverImage, plateAspect);
          photoCache.set(recipe.id, loaded);
        }
        if (recipe.extraImages && recipe.extraImages.length > 0) {
          const extraLoaded = await Promise.all(
            recipe.extraImages
              .slice(0, 3)
              .map((imgSrc) => loadImageAsJpegDataUrl(imgSrc, 4 / 3))
          );
          extraPhotosCache.set(
            recipe.id,
            extraLoaded.filter(
              (item): item is { dataUrl: string; width: number; height: number } => Boolean(item)
            )
          );
        }
      })
    );
  }

  // 1. Classic Editorial Frontpage (Voorblad) featuring the Aan Tafel! logo
  if (settings.includeCover) {
    startFreshPage();
    const centerX = pageWidth / 2;
    const brandNavy: [number, number, number] = [28, 52, 84];

    // Subtle warm editorial top kicker
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...inkSoft);
    doc.text((settings.familyName || 'Familie-editie').toUpperCase(), centerX, 34, {
      align: 'center',
      charSpace: 2,
    });

    let afterLogoY = 178;
    if (coverLogo) {
      const logoW = 114;
      const logoH = logoW * (coverLogo.height / coverLogo.width);
      const logoX = (pageWidth - logoW) / 2;
      const logoY = 64;
      doc.addImage(coverLogo.dataUrl, 'JPEG', logoX, logoY, logoW, logoH, undefined, 'MEDIUM');
      afterLogoY = logoY + logoH + 14;
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(34);
      doc.setTextColor(...brandNavy);
      doc.text('Aan Tafel!', centerX, 118, { align: 'center' });
      afterLogoY = 136;
    }

    // Centered razor-thin editorial hairline
    doc.setDrawColor(...ruleGrey);
    doc.setLineWidth(0.25);
    doc.line(centerX - 36, afterLogoY, centerX + 36, afterLogoY);

    let textY = afterLogoY + 13;
    const cleanTitle = (settings.title || '').trim();
    if (cleanTitle && cleanTitle.toLowerCase() !== 'aan tafel!' && cleanTitle.toLowerCase() !== 'aan tafel') {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(...brandNavy);
      const titleLines = doc.splitTextToSize(cleanTitle, 130);
      doc.text(titleLines, centerX, textY, { align: 'center' });
      textY += titleLines.length * 7 + 4;
    }

    if (settings.subtitle.trim()) {
      doc.setFont('helvetica', 'oblique');
      doc.setFontSize(11);
      doc.setTextColor(...inkSoft);
      const subLines = doc.splitTextToSize(settings.subtitle.trim(), 126);
      doc.text(subLines, centerX, textY, { align: 'center' });
    }

    const year = new Date().getFullYear();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...inkSoft);
    doc.text(
      `${orderedRecipes.length} ${orderedRecipes.length === 1 ? 'recept' : 'recepten'}  ·  ${year}`,
      centerX,
      pageHeight - 22,
      { align: 'center' }
    );
  }

  // Reserve page for 'Inhoud' (Photo 5 style)
  let tocPageNumber: number | null = null;
  if (settings.includeToc) {
    startFreshPage();
    tocPageNumber = doc.getNumberOfPages();
  }

  const recipePageRecords: { recipe: Recipe; page: number }[] = [];
  const chapterFirstPage = new Map<string, number>();

  // 2. Render Recipes (Photos 1, 2, 3 style)
  for (const recipe of orderedRecipes) {
    startFreshPage();
    const startPage = doc.getNumberOfPages();
    recipePageRecords.push({ recipe, page: startPage });
    if (!chapterFirstPage.has(recipe.category)) {
      chapterFirstPage.set(recipe.category, startPage);
    }

    const recMarginX = 18;
    const recContentW = pageWidth - recMarginX * 2; // 174mm
    const maxContentY = pageHeight - 18; // 279mm (page number at 287mm)

    const drawPageNumber = (pageNum: number, align: 'left' | 'right') => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(...inkBlack);
      if (align === 'left') {
        doc.text(String(pageNum), recMarginX, pageHeight - 11);
      } else {
        doc.text(String(pageNum), pageWidth - recMarginX, pageHeight - 11, { align: 'right' });
      }
    };

    const loadedPhoto = settings.includePhotos ? photoCache.get(recipe.id) || null : null;
    const loadedExtraPhotos = settings.includePhotos ? extraPhotosCache.get(recipe.id) || [] : [];
    const hasInlinePhoto = Boolean(loadedPhoto && !settings.photoOnOppositePage);
    const totalPhotos = (loadedPhoto ? 1 : 0) + loadedExtraPhotos.length;
    const recipeComments = settings.includeComments ? commentsByRecipe[recipe.id] || [] : [];

    // Prepare italic intro/history paragraphs (subtitle + story)
    const italicIntroParagraphs: string[] = [];
    if (recipe.subtitle.trim()) {
      italicIntroParagraphs.push(recipe.subtitle.trim());
    }
    if (recipe.story.trim()) {
      italicIntroParagraphs.push(...recipe.story.trim().split(/\n\s*\n/).filter(Boolean));
    }

    const activeIngredients = recipe.ingredients.filter((ing) => ing.name.trim().length > 0);
    const activeSteps = recipe.steps
      .map((s, idx) => ({
        text: s.trim(),
        optional: isStepOptional(recipe.optionalStepIndices, idx),
      }))
      .filter((s) => s.text.length > 0);

    // Measure exact layout for a candidate (scale, leftW) so every recipe fits comfortably on ONE A4 page (< 1 A4)
    const evaluateLayout = (scale: number, leftW: number): RecipeA4LayoutSolution => {
      const gutter = 8.5;
      const rightW = recContentW - leftW - gutter;
      const headerScale = Math.max(0.84, scale);

      const titleFontSize = Number((17.0 * headerScale).toFixed(2));
      const titleLineH = Number((6.8 * headerScale).toFixed(2));
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(titleFontSize);
      const titleLines = doc.splitTextToSize(recipe.title, recContentW);

      const titleY = 23.5;
      let ruleY = titleY + (titleLines.length - 1) * titleLineH + 5.2 * headerScale;
      const inlinePhotoH = hasInlinePhoto ? Math.round(48 * Math.max(0.75, scale)) : 0;
      if (hasInlinePhoto) {
        ruleY += inlinePhotoH + 4;
      }
      const bodyStartY = ruleY + 7.5 * headerScale;
      const usableHeight = maxContentY - bodyStartY;

      const servingsFontSize = Number((8.4 * scale).toFixed(2));
      const metaFontSize = Number((7.8 * scale).toFixed(2));
      const metaLineH = Number((3.65 * scale).toFixed(2));
      const ingFontSize = Number((8.0 * scale).toFixed(2));
      const ingLineH = Number((3.6 * scale).toFixed(2));
      const ingGap = Number((1.15 * scale).toFixed(2));
      const ingHangingIndent = 2.6;

      // Measure LEFT column height
      let leftH = metaLineH + metaLineH * 2 + 5.5 * scale;
      for (const ing of activeIngredients) {
        const { boldPart, prepPart, optional } = formatIngredientParts(ing);
        const tokens = buildIngredientTokens(boldPart, prepPart, optional);
        const lines = layoutStyledTokens(doc, tokens, leftW, ingHangingIndent, ingFontSize);
        leftH += lines.length * ingLineH + ingGap;
      }

      const introFontSize = Number((8.8 * scale).toFixed(2));
      const introLineH = Number((4.0 * scale).toFixed(2));
      const introParaGap = Number((2.4 * scale).toFixed(2));
      const introAfterGap = Number((2.2 * scale).toFixed(2));
      const stepFontSize = Number((8.9 * scale).toFixed(2));
      const stepLineH = Number((4.05 * scale).toFixed(2));
      const stepGap = Number((2.7 * scale).toFixed(2));
      const noteFontSize = Number((8.4 * scale).toFixed(2));
      const noteLineH = Number((3.85 * scale).toFixed(2));
      const commentFontSize = Number((8.1 * scale).toFixed(2));
      const commentLineH = Number((3.7 * scale).toFixed(2));
      const refFontSize = Number((8.0 * scale).toFixed(2));

      // Measure RIGHT column height
      let rightH = 0;
      if (italicIntroParagraphs.length > 0) {
        doc.setFont('helvetica', 'oblique');
        doc.setFontSize(introFontSize);
        for (const para of italicIntroParagraphs) {
          const lines = doc.splitTextToSize(para.trim(), rightW);
          rightH += lines.length * introLineH + introParaGap;
        }
        rightH += introAfterGap;
      }

      activeSteps.forEach((step, idx) => {
        const tokens = buildStepTokens(idx + 1, step.text, step.optional);
        const lines = layoutStyledTokens(doc, tokens, rightW, 0, stepFontSize);
        rightH += lines.length * stepLineH + stepGap;
      });

      if (recipe.notes.trim()) {
        doc.setFont('helvetica', 'oblique');
        doc.setFontSize(noteFontSize);
        const noteLines = doc.splitTextToSize(recipe.notes.trim(), rightW);
        rightH += 1.5 * scale + noteLines.length * noteLineH + 2.5 * scale;
      }

      if (recipeComments.length > 0) {
        rightH += 2.0 * scale + 4.5 * scale + 4.0 * scale;
        doc.setFont('helvetica', 'oblique');
        doc.setFontSize(commentFontSize);
        for (const cmt of recipeComments) {
          const cLines = doc.splitTextToSize(`${cmt.text} — ${cmt.authorName}`, rightW);
          rightH += cLines.length * commentLineH + 2.0 * scale;
        }
      }

      if (settings.includePhotos && totalPhotos > 0) {
        rightH += 2.5 * scale + 4.2 * scale + 3.5;
      }

      return {
        scale,
        leftW,
        rightW,
        gutter,
        titleFontSize,
        titleLineH,
        titleLines,
        inlinePhotoH,
        ruleY,
        bodyStartY,
        servingsFontSize,
        metaFontSize,
        metaLineH,
        ingFontSize,
        ingLineH,
        ingGap,
        ingHangingIndent,
        introFontSize,
        introLineH,
        introParaGap,
        introAfterGap,
        stepFontSize,
        stepLineH,
        stepGap,
        noteFontSize,
        noteLineH,
        commentFontSize,
        commentLineH,
        refFontSize,
        leftHeight: leftH,
        rightHeight: rightH,
        usableHeight,
      };
    };

    const candidateScales = [1.0, 0.94, 0.89, 0.84, 0.79, 0.75, 0.71, 0.67, 0.63];
    const candidateLeftWidths = [52, 57, 47, 61];

    const bestForScale = (scale: number): RecipeA4LayoutSolution => {
      let best = evaluateLayout(scale, candidateLeftWidths[0]);
      let bestPeak = Math.max(best.leftHeight, best.rightHeight);
      for (let i = 1; i < candidateLeftWidths.length; i++) {
        const candidate = evaluateLayout(scale, candidateLeftWidths[i]);
        const peak = Math.max(candidate.leftHeight, candidate.rightHeight);
        if (peak < bestPeak - 1.5) {
          best = candidate;
          bestPeak = peak;
        }
      }
      return best;
    };

    // Pass 1: Aim for <= 87% of usable A4 height so recipes (like the spruiten recipe) sit comfortably smaller than 1 full A4
    let layout: RecipeA4LayoutSolution | null = null;
    for (const s of candidateScales) {
      const candidate = bestForScale(s);
      if (Math.max(candidate.leftHeight, candidate.rightHeight) <= candidate.usableHeight * 0.87) {
        layout = candidate;
        break;
      }
    }
    // Pass 2: If ultra-long, still guarantee strict 1-page A4 fit (<= 98% of usable height)
    if (!layout) {
      for (const s of candidateScales) {
        const candidate = bestForScale(s);
        if (Math.max(candidate.leftHeight, candidate.rightHeight) <= candidate.usableHeight * 0.98) {
          layout = candidate;
          break;
        }
      }
    }
    // Fallback for extreme outliers
    if (!layout) {
      layout = bestForScale(0.67);
    }

    // Top-left uppercase chapter running header
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.0);
    doc.setTextColor(...inkSoft);
    doc.text(recipe.category.toUpperCase(), recMarginX, 14, { charSpace: 0.7 });

    // Bold sans-serif recipe title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(layout.titleFontSize);
    doc.setTextColor(...inkBlack);
    doc.text(layout.titleLines, recMarginX, 23.5);

    // Optional inline photo when photoOnOppositePage is OFF
    if (loadedPhoto && !settings.photoOnOppositePage && layout.inlinePhotoH > 0) {
      const photoY = layout.ruleY - layout.inlinePhotoH - 4;
      doc.addImage(
        loadedPhoto.dataUrl,
        'JPEG',
        recMarginX,
        photoY,
        recContentW,
        layout.inlinePhotoH,
        undefined,
        'MEDIUM'
      );
    }

    // Single razor-thin horizontal hairline separating title from 2-column body
    doc.setDrawColor(...ruleGrey);
    doc.setLineWidth(0.22);
    doc.line(recMarginX, layout.ruleY, pageWidth - recMarginX, layout.ruleY);

    const leftX = recMarginX;
    const rightX = leftX + layout.leftW + layout.gutter;

    // --- LEFT COLUMN: Timings + Bold Ingredient, Regular Preparation (optional in parentheses) ---
    let leftY = layout.bodyStartY;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(layout.servingsFontSize);
    doc.setTextColor(...inkBlack);
    doc.text(
      `Voor ${recipe.servings} ${recipe.servings === 1 ? 'persoon' : 'personen'}`,
      leftX,
      leftY
    );
    leftY += layout.metaLineH;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(layout.metaFontSize);
    doc.setTextColor(...inkSoft);
    doc.text(`Voorbereiden: ${formatDurationDutch(recipe.prepMinutes)}`, leftX, leftY);
    leftY += layout.metaLineH;
    doc.text(`Bereiden: ${formatDurationDutch(recipe.cookMinutes)}`, leftX, leftY);
    leftY += 5.5 * layout.scale;

    for (const ing of activeIngredients) {
      const { boldPart, prepPart, optional } = formatIngredientParts(ing);
      const tokens = buildIngredientTokens(boldPart, prepPart, optional);
      const lines = layoutStyledTokens(
        doc,
        tokens,
        layout.leftW,
        layout.ingHangingIndent,
        layout.ingFontSize
      );
      if (leftY + lines.length * layout.ingLineH > maxContentY + 2) break;

      leftY = drawStyledLines(
        doc,
        lines,
        leftX,
        leftY,
        layout.ingHangingIndent,
        layout.ingFontSize,
        layout.ingLineH,
        inkBlack,
        inkSoft
      );
      leftY += layout.ingGap;
    }

    // --- RIGHT COLUMN: Strictly Italic Dish History/Intro + Bold First-Sentence Steps + Photo Page Ref ---
    let rightY = layout.bodyStartY;
    let isOverflowPage = false;

    const ensureRightSpace = (neededMm: number) => {
      if (rightY + neededMm > maxContentY) {
        drawPageNumber(doc.getNumberOfPages(), 'left');
        doc.addPage();
        isOverflowPage = true;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.0);
        doc.setTextColor(...inkSoft);
        doc.text(`${recipe.category.toUpperCase()}  ·  ${recipe.title}`, recMarginX, 14);
        rightY = 24;
      }
    };

    const drawColX = () => (isOverflowPage ? recMarginX : rightX);
    const drawColW = () => (isOverflowPage ? recContentW : layout.rightW);

    // Strictly italic editorial intro & dish history paragraphs (subtitle + story)
    if (italicIntroParagraphs.length > 0) {
      for (const para of italicIntroParagraphs) {
        doc.setFont('helvetica', 'oblique');
        doc.setFontSize(layout.introFontSize);
        const lines = doc.splitTextToSize(para.trim(), drawColW());
        ensureRightSpace(lines.length * layout.introLineH + layout.introParaGap);
        doc.setFont('helvetica', 'oblique');
        doc.setFontSize(layout.introFontSize);
        doc.setTextColor(...inkBlack);
        doc.text(lines, drawColX(), rightY);
        rightY += lines.length * layout.introLineH + layout.introParaGap;
      }
      rightY += layout.introAfterGap;
    }

    // Numbered preparation steps: bold numeral + bold first sentence + regular remainder (optional steps in parentheses)
    activeSteps.forEach((step, idx) => {
      const tokens = buildStepTokens(idx + 1, step.text, step.optional);
      const lines = layoutStyledTokens(doc, tokens, drawColW(), 0, layout.stepFontSize);
      ensureRightSpace(lines.length * layout.stepLineH + layout.stepGap);

      // Re-layout if we just moved onto an overflow page with wider contentWidth
      const finalLines = isOverflowPage
        ? layoutStyledTokens(doc, tokens, drawColW(), 0, layout.stepFontSize)
        : lines;

      rightY = drawStyledLines(
        doc,
        finalLines,
        drawColX(),
        rightY,
        0,
        layout.stepFontSize,
        layout.stepLineH,
        inkBlack,
        inkSoft
      );
      rightY += layout.stepGap;
    });

    // Optional chef's notes / kooktip in clean italic
    if (recipe.notes.trim()) {
      doc.setFont('helvetica', 'oblique');
      doc.setFontSize(layout.noteFontSize);
      const noteLines = doc.splitTextToSize(recipe.notes.trim(), drawColW());
      ensureRightSpace(noteLines.length * layout.noteLineH + 4 * layout.scale);
      rightY += 1.5 * layout.scale;
      doc.setFont('helvetica', 'oblique');
      doc.setFontSize(layout.noteFontSize);
      doc.setTextColor(...inkSoft);
      doc.text(noteLines, drawColX(), rightY);
      rightY += noteLines.length * layout.noteLineH + 2.5 * layout.scale;
    }

    // Optional Family Comments (clean italic attribution below steps)
    if (recipeComments.length > 0) {
      rightY += 2.0 * layout.scale;
      ensureRightSpace(11 * layout.scale);
      doc.setDrawColor(...ruleGrey);
      doc.setLineWidth(0.2);
      doc.line(drawColX(), rightY, drawColX() + 24, rightY);
      rightY += 4.5 * layout.scale;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(Math.max(7.2, layout.commentFontSize - 0.4));
      doc.setTextColor(...inkSoft);
      doc.text('FAMILIENOTITIES', drawColX(), rightY, { charSpace: 0.7 });
      rightY += 4.0 * layout.scale;

      for (const cmt of recipeComments) {
        doc.setFont('helvetica', 'oblique');
        doc.setFontSize(layout.commentFontSize);
        const cLines = doc.splitTextToSize(`${cmt.text} — ${cmt.authorName}`, drawColW());
        ensureRightSpace(cLines.length * layout.commentLineH + 2.0 * layout.scale);
        doc.setFont('helvetica', 'oblique');
        doc.setFontSize(layout.commentFontSize);
        doc.setTextColor(...inkSoft);
        doc.text(cLines, drawColX(), rightY);
        rightY += cLines.length * layout.commentLineH + 2.0 * layout.scale;
      }
    }

    // Explicit photo page reference at the bottom of the recipe
    if (settings.includePhotos && totalPhotos > 0) {
      ensureRightSpace(8);
      const nextAvailablePage = doc.getNumberOfPages() + 1;
      let photoRefText = '';

      if (settings.photoOnOppositePage) {
        const photoPagesCount = (loadedPhoto ? 1 : 0) + (loadedExtraPhotos.length > 0 ? 1 : 0);
        const photoStartPage = nextAvailablePage;
        const photoEndPage = photoStartPage + photoPagesCount - 1;
        if (totalPhotos === 1) {
          photoRefText = `Foto op bladzijde ${photoStartPage}`;
        } else if (photoEndPage === photoStartPage) {
          photoRefText = `Foto's op bladzijde ${photoStartPage}`;
        } else {
          photoRefText = `Foto's op bladzijde ${photoStartPage}–${photoEndPage}`;
        }
      } else if (loadedPhoto && loadedExtraPhotos.length > 0) {
        photoRefText = `Foto's op bladzijde ${startPage} en ${nextAvailablePage}`;
      } else if (loadedPhoto) {
        photoRefText = `Foto op bladzijde ${startPage}`;
      } else {
        photoRefText = `${loadedExtraPhotos.length === 1 ? 'Foto' : "Foto's"} op bladzijde ${nextAvailablePage}`;
      }

      rightY += 2.5 * layout.scale;
      doc.setDrawColor(...ruleGrey);
      doc.setLineWidth(0.2);
      doc.line(drawColX(), rightY, drawColX() + 18, rightY);
      rightY += 4.2 * layout.scale;
      doc.setFont('helvetica', 'oblique');
      doc.setFontSize(layout.refFontSize);
      doc.setTextColor(...inkSoft);
      doc.text(photoRefText, drawColX(), rightY);
    }

    // Bottom-left page number on recipe text page
    drawPageNumber(doc.getNumberOfPages(), 'left');

    // --- OPPOSITE RIGHT PAGE: FULL-PAGE PHOTOGRAPH PLATE (Photo 2 style) ---
    if (settings.includePhotos && settings.photoOnOppositePage && loadedPhoto) {
      doc.addPage();
      const photoPageNum = doc.getNumberOfPages();

      // Top-right uppercase chapter running header (Photo 2)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(...inkSoft);
      doc.text(recipe.category.toUpperCase(), pageWidth - marginX, 18, {
        align: 'right',
        charSpace: 0.7,
      });

      // Large framed dish photograph filling the page cleanly
      const plateMarginX = 24;
      const plateW = pageWidth - plateMarginX * 2; // 162mm
      const plateH = 236;
      const plateY = 25;
      doc.addImage(
        loadedPhoto.dataUrl,
        'JPEG',
        plateMarginX,
        plateY,
        plateW,
        plateH,
        undefined,
        'MEDIUM'
      );

      // Bottom-right page number (Photo 2)
      drawPageNumber(photoPageNum, 'right');
    }

    // --- OPTIONAL EXTRA PHOTOS PLATE PAGE ---
    if (settings.includePhotos && loadedExtraPhotos.length > 0) {
      doc.addPage();
      const extraPageNum = doc.getNumberOfPages();

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(...inkSoft);
      doc.text(recipe.category.toUpperCase(), pageWidth - marginX, 18, {
        align: 'right',
        charSpace: 0.7,
      });

      const plateMarginX = 24;
      const plateW = pageWidth - plateMarginX * 2; // 162mm
      const gap = 8;

      if (loadedExtraPhotos.length === 1) {
        const imgH = 122;
        doc.addImage(loadedExtraPhotos[0].dataUrl, 'JPEG', plateMarginX, 34, plateW, imgH, undefined, 'MEDIUM');
      } else if (loadedExtraPhotos.length === 2) {
        const imgH = 112;
        doc.addImage(loadedExtraPhotos[0].dataUrl, 'JPEG', plateMarginX, 26, plateW, imgH, undefined, 'MEDIUM');
        doc.addImage(loadedExtraPhotos[1].dataUrl, 'JPEG', plateMarginX, 26 + imgH + gap, plateW, imgH, undefined, 'MEDIUM');
      } else {
        const topH = 116;
        const bottomW = (plateW - gap) / 2;
        const bottomH = 104;
        doc.addImage(loadedExtraPhotos[0].dataUrl, 'JPEG', plateMarginX, 26, plateW, topH, undefined, 'MEDIUM');
        doc.addImage(loadedExtraPhotos[1].dataUrl, 'JPEG', plateMarginX, 26 + topH + gap, bottomW, bottomH, undefined, 'MEDIUM');
        doc.addImage(loadedExtraPhotos[2].dataUrl, 'JPEG', plateMarginX + bottomW + gap, 26 + topH + gap, bottomW, bottomH, undefined, 'MEDIUM');
      }

      doc.setFont('helvetica', 'oblique');
      doc.setFontSize(8.2);
      doc.setTextColor(...inkSoft);
      doc.text(recipe.title, plateMarginX, pageHeight - 23);

      drawPageNumber(extraPageNum, 'right');
    }
  }

  // 3. Render 3-Column Alphabetical 'REGISTER' at the Back (Photo 4 style)
  let registerStartPage: number | null = null;
  if (settings.includeRegister) {
    startFreshPage();
    registerStartPage = doc.getNumberOfPages();

    const registerEntries = buildAlphabeticalRegister(recipePageRecords);
    const regMarginX = 16;
    const colGap = 6;
    const colCount = 3;
    const colW = (pageWidth - regMarginX * 2 - colGap * (colCount - 1)) / colCount; // ~55.3mm
    const colTopY = 30;
    const colBottomY = pageHeight - 24;

    const drawRegisterHeader = () => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(...inkSoft);
      doc.text('REGISTER', pageWidth - regMarginX, 18, { align: 'right', charSpace: 0.9 });
    };

    const drawRegisterPageNum = () => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...inkBlack);
      doc.text(String(doc.getNumberOfPages()), pageWidth - regMarginX, pageHeight - 15, {
        align: 'right',
      });
    };

    drawRegisterHeader();
    let currentCol = 0;
    let curY = colTopY;

    const advanceColumnOrPage = (neededHeight: number) => {
      if (curY + neededHeight > colBottomY) {
        currentCol += 1;
        curY = colTopY;
        if (currentCol >= colCount) {
          drawRegisterPageNum();
          doc.addPage();
          drawRegisterHeader();
          currentCol = 0;
          curY = colTopY;
        }
      }
    };

    for (const entry of registerEntries) {
      const colX = () => regMarginX + currentCol * (colW + colGap);

      if (entry.refs.length === 1 && entry.headword === entry.refs[0].title.toLowerCase()) {
        // Direct recipe title entry: bold title + page number
        const label = `${entry.refs[0].title} ${entry.refs[0].page}`;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.8);
        const lines = doc.splitTextToSize(label, colW);
        advanceColumnOrPage(lines.length * 3.6 + 1.5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.8);
        doc.setTextColor(...inkBlack);
        lines.forEach((line: string, i: number) => {
          doc.text(line, colX() + (i === 0 ? 0 : 2.5), curY);
          curY += 3.6;
        });
        curY += 0.8;
      } else if (entry.refs.length === 1) {
        // Single ingredient -> bold headword: regular recipe title page
        const headText = `${entry.headword}: `;
        const restText = `${entry.refs[0].title} ${entry.refs[0].page}`;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.8);
        const fullLines = doc.splitTextToSize(`${headText}${restText}`, colW);
        advanceColumnOrPage(fullLines.length * 3.6 + 1.5);

        const x0 = colX();
        const firstLine = fullLines[0] || '';
        const firstRest = firstLine.startsWith(headText)
          ? firstLine.slice(headText.length)
          : firstLine;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.8);
        doc.setTextColor(...inkBlack);
        doc.text(headText, x0, curY);
        const hw = doc.getTextWidth(headText);
        doc.setFont('helvetica', 'normal');
        doc.text(firstRest, x0 + hw, curY);
        curY += 3.6;

        for (let i = 1; i < fullLines.length; i++) {
          doc.setFont('helvetica', 'normal');
          doc.text(fullLines[i], x0 + 2.5, curY);
          curY += 3.6;
        }
        curY += 0.8;
      } else {
        // Multiple recipes under one ingredient headword (Photo 4 exact pattern!)
        advanceColumnOrPage(4 + entry.refs.length * 3.8);
        const x0 = colX();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.8);
        doc.setTextColor(...inkBlack);
        doc.text(`${entry.headword}:`, x0, curY);
        curY += 3.6;

        for (const ref of entry.refs) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.8);
          const refLines = doc.splitTextToSize(`${ref.title} ${ref.page}`, colW - 3);
          advanceColumnOrPage(refLines.length * 3.6 + 0.6);
          const rx = colX();
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.8);
          doc.setTextColor(...inkBlack);
          refLines.forEach((line: string) => {
            doc.text(line, rx + 3, curY);
            curY += 3.6;
          });
        }
        curY += 0.9;
      }
    }

    drawRegisterPageNum();
  }

  // 4. Populate 'Inhoud' Page (Photo 5 exact style: bold 'Inhoud', bold chapters left, bold numbers right, NO lines!)
  if (tocPageNumber !== null) {
    doc.setPage(tocPageNumber);
    const tocLeftX = 24;
    const tocRightX = pageWidth - 24;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(...inkBlack);
    doc.text('Inhoud', tocLeftX, 42);

    let y = 74;

    // Group chapters in book order with their starting page number
    const orderedChapters = Array.from(chapterFirstPage.entries());
    for (const [chapterName, startPg] of orderedChapters) {
      if (y > pageHeight - 48) break;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13.5);
      doc.setTextColor(...inkBlack);
      doc.text(chapterName, tocLeftX, y);
      doc.text(String(startPg), tocRightX, y, { align: 'right' });
      y += 12;
    }

    // Extra breathing gap before back-matter 'Register' (just like Photo 5!)
    if (registerStartPage !== null) {
      y += 10;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...inkBlack);
      doc.text('Register', tocLeftX, y);
      doc.text(String(registerStartPage), tocRightX, y, { align: 'right' });
    }
  }

  doc.save(`${sanitizeFilename(settings.title || 'familiekookboek')}.pdf`);
}

export interface RecurringDuePdfItem {
  name: string;
  amount: string;
  note: string;
}

/**
 * Compact 2-column A4 shopping sheet designed to fit an entire week's groceries on 1 page.
 */
export function generateShoppingListPdf(
  title: string,
  selectedRecipeNames: string[],
  items: AggregatedGroceryItem[],
  manualItems: ManualShoppingItem[],
  checkedKeys: Set<string>,
  dueRecurring: RecurringDuePdfItem[] = []
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const colGap = 8;
  const colW = (pageWidth - marginX * 2 - colGap) / 2;
  const leftX = marginX;
  const rightX = marginX + colW + colGap;

  let headerY = 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(28, 52, 84);
  doc.text('AAN TAFEL! · COMPACTE BOODSCHAPPENLIJST', marginX, headerY, { charSpace: 1 });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 108);
  doc.text(formatDateNl(Date.now()), pageWidth - marginX, headerY, { align: 'right' });
  headerY += 6.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(17, 19, 21);
  doc.text(title || 'Boodschappenlijst', marginX, headerY);
  headerY += 5;

  if (selectedRecipeNames.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(90, 92, 98);
    const recText = doc.splitTextToSize(
      `Gerechten: ${selectedRecipeNames.join(' · ')}`,
      pageWidth - marginX * 2
    );
    doc.text(recText, marginX, headerY);
    headerY += recText.length * 3.8 + 2;
  }

  doc.setDrawColor(220, 220, 224);
  doc.setLineWidth(0.25);
  doc.line(marginX, headerY, pageWidth - marginX, headerY);
  headerY += 6;

  const drawCompactListSection = (
    x: number,
    startY: number,
    heading: string,
    accent: [number, number, number],
    rows: { qty: string; name: string; sub?: string }[]
  ): number => {
    if (rows.length === 0) return startY;
    let y = startY;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...accent);
    doc.text(`${heading} (${rows.length})`, x, y);
    y += 2;
    doc.setDrawColor(...accent);
    doc.setLineWidth(0.25);
    doc.line(x, y, x + colW, y);
    y += 4.8;

    for (const row of rows) {
      if (y > pageHeight - 14) break;
      doc.setDrawColor(160, 160, 168);
      doc.setLineWidth(0.2);
      doc.rect(x, y - 2.8, 3, 3);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(17, 19, 21);
      doc.text(row.qty.slice(0, 14), x + 4.8, y);

      doc.setFont('helvetica', 'normal');
      const nameStr = row.sub ? `${row.name} (${row.sub})` : row.name;
      const lines = doc.splitTextToSize(nameStr, colW - 24);
      doc.text(lines, x + 23, y);
      y += Math.max(4.6, lines.length * 3.8 + 0.8);
    }

    return y + 4;
  };

  const buildRows = (cat: StorageCategory) => [
    ...items
      .filter((i) => i.storageCategory === cat && !checkedKeys.has(i.key))
      .map((i) => ({ qty: i.displayAmount, name: i.name })),
    ...manualItems
      .filter((m) => m.storageCategory === cat && !m.checked)
      .map((m) => ({
        qty: [m.amount, m.unit].filter(Boolean).join(' ') || '1x',
        name: m.name,
      })),
  ];

  let leftY = headerY;
  leftY = drawCompactListSection(leftX, leftY, 'Vers te kopen', [20, 83, 45], buildRows('vers'));
  leftY = drawCompactListSection(
    leftX,
    leftY,
    STORAGE_CATEGORY_META.bakkerij.label,
    [63, 63, 70],
    buildRows('bakkerij')
  );
  drawCompactListSection(
    leftX,
    leftY,
    STORAGE_CATEGORY_META.diepvries.label,
    [30, 64, 175],
    buildRows('diepvries')
  );

  let rightY = headerY;
  rightY = drawCompactListSection(
    rightX,
    rightY,
    'In de voorraad (normaal) — checken',
    [146, 64, 14],
    buildRows('proviandkast')
  );

  if (dueRecurring.length > 0) {
    drawCompactListSection(
      rightX,
      rightY,
      'Terugkerend — te checken in voorraad',
      [146, 64, 14],
      dueRecurring.map((r) => ({ qty: r.amount, name: r.name, sub: r.note }))
    );
  }

  doc.save(`${sanitizeFilename(title || 'boodschappenlijst')}.pdf`);
}
