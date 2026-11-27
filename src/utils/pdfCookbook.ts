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

  // Preload photos (cropped to tall editorial portrait plate when placed on opposite page)
  const photoCache = new Map<string, { dataUrl: string; width: number; height: number } | null>();
  if (settings.includePhotos) {
    const plateAspect = settings.photoOnOppositePage ? 162 / 236 : 170 / 72;
    await Promise.all(
      orderedRecipes.map(async (recipe) => {
        if (recipe.coverImage) {
          const loaded = await loadImageAsJpegDataUrl(recipe.coverImage, plateAspect);
          photoCache.set(recipe.id, loaded);
        }
      })
    );
  }

  // 1. Minimalist Editorial Cover Page (Voorblad)
  if (settings.includeCover) {
    startFreshPage();

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...inkSoft);
    doc.text((settings.familyName || 'Familiekookboek').toUpperCase(), marginX, 34, {
      charSpace: 1.5,
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(34);
    doc.setTextColor(...inkBlack);
    const titleLines = doc.splitTextToSize(settings.title || 'Ons Familiekookboek', contentWidth);
    doc.text(titleLines, marginX, 62);

    const afterTitleY = 62 + titleLines.length * 13;

    doc.setDrawColor(...ruleGrey);
    doc.setLineWidth(0.25);
    doc.line(marginX, afterTitleY + 2, pageWidth - marginX, afterTitleY + 2);

    if (settings.subtitle.trim()) {
      doc.setFont('helvetica', 'oblique');
      doc.setFontSize(12);
      doc.setTextColor(...inkSoft);
      const subLines = doc.splitTextToSize(settings.subtitle.trim(), 130);
      doc.text(subLines, marginX, afterTitleY + 13);
    }

    if (settings.includePhotos) {
      const firstPhotoRecipe = orderedRecipes.find((r) => photoCache.get(r.id));
      const coverPhoto = firstPhotoRecipe ? photoCache.get(firstPhotoRecipe.id) : null;
      if (coverPhoto) {
        const boxW = contentWidth;
        const boxH = 128;
        const imgY = Math.max(afterTitleY + 30, 128);
        doc.addImage(coverPhoto.dataUrl, 'JPEG', marginX, imgY, boxW, boxH, undefined, 'MEDIUM');
      }
    }

    const year = new Date().getFullYear();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...inkSoft);
    doc.text(
      `${orderedRecipes.length} ${orderedRecipes.length === 1 ? 'recept' : 'recepten'}  ·  ${year}`,
      marginX,
      pageHeight - 20
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

    const drawPageNumber = (pageNum: number, align: 'left' | 'right') => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...inkBlack);
      if (align === 'left') {
        doc.text(String(pageNum), marginX, pageHeight - 15);
      } else {
        doc.text(String(pageNum), pageWidth - marginX, pageHeight - 15, { align: 'right' });
      }
    };

    // Top-left uppercase chapter running header (Photo 1 & 3)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(...inkSoft);
    doc.text(recipe.category.toUpperCase(), marginX, 18, { charSpace: 0.7 });

    // Bold sans-serif recipe title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.setTextColor(...inkBlack);
    const titleLines = doc.splitTextToSize(recipe.title, contentWidth);
    doc.text(titleLines, marginX, 34);

    let ruleY = 34 + titleLines.length * 8 + 12;

    // Optional inline photo when photoOnOppositePage is OFF
    const loadedPhoto = settings.includePhotos ? photoCache.get(recipe.id) : null;
    if (loadedPhoto && !settings.photoOnOppositePage) {
      const inlineH = 62;
      doc.addImage(
        loadedPhoto.dataUrl,
        'JPEG',
        marginX,
        ruleY - 6,
        contentWidth,
        inlineH,
        undefined,
        'MEDIUM'
      );
      ruleY += inlineH + 4;
    }

    // Single razor-thin horizontal hairline separating title from 2-column body (Photo 1 & 3)
    doc.setDrawColor(...ruleGrey);
    doc.setLineWidth(0.22);
    doc.line(marginX, ruleY, pageWidth - marginX, ruleY);

    const bodyStartY = ruleY + 11;

    // Asymmetric 2-Column Layout (borderless left ingredients column + wide right story & steps)
    const leftX = marginX;
    const leftW = 47;
    const gutter = 11;
    const rightX = leftX + leftW + gutter;
    const rightW = contentWidth - leftW - gutter; // 112mm

    // --- LEFT COLUMN: Timings + Bold Hanging-Indent Ingredients ---
    let leftY = bodyStartY;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(...inkBlack);
    doc.text(
      `Voor ${recipe.servings} ${recipe.servings === 1 ? 'persoon' : 'personen'}`,
      leftX,
      leftY
    );
    leftY += 4.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(...inkSoft);
    doc.text(`Voorbereiden: ${formatDurationDutch(recipe.prepMinutes)}`, leftX, leftY);
    leftY += 4.2;
    doc.text(`Bereiden: ${formatDurationDutch(recipe.cookMinutes)}`, leftX, leftY);
    leftY += 10;

    // Ingredients (bold primary text, hanging indent +3mm on wrapped lines, parenthetical in oblique)
    const hangingIndent = 3;
    for (const ing of recipe.ingredients) {
      if (!ing.name.trim()) continue;
      if (leftY > pageHeight - 24) break;

      const qtyStr = [ing.amount.trim(), ing.unit.trim()].filter(Boolean).join(' ');
      // Split optional parenthetical detail like "Goudrenetten (of Elstar appels)"
      const parenMatch = ing.name.trim().match(/^([^(]+)(\(.+\))$/);
      const mainPart = parenMatch
        ? `${qtyStr ? `${qtyStr} ` : ''}${parenMatch[1].trim()}`
        : `${qtyStr ? `${qtyStr} ` : ''}${ing.name.trim()}`;
      const detailPart = parenMatch ? parenMatch[2].trim() : '';

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.4);
      doc.setTextColor(...inkBlack);

      const firstLineMaxW = leftW;
      const wrappedMain = doc.splitTextToSize(mainPart, firstLineMaxW);
      wrappedMain.forEach((line: string, lineIdx: number) => {
        if (leftY > pageHeight - 24) return;
        const xOffset = lineIdx === 0 ? 0 : hangingIndent;
        doc.text(line, leftX + xOffset, leftY);
        leftY += 4.1;
      });

      if (detailPart && leftY <= pageHeight - 24) {
        doc.setFont('helvetica', 'oblique');
        doc.setFontSize(8);
        doc.setTextColor(...inkSoft);
        const detailLines = doc.splitTextToSize(detailPart, leftW - hangingIndent);
        detailLines.forEach((dLine: string) => {
          if (leftY > pageHeight - 24) return;
          doc.text(dLine, leftX + hangingIndent, leftY);
          leftY += 3.9;
        });
      }

      leftY += 1.2;
    }

    // --- RIGHT COLUMN: Italic Intro/Story + Inline Bold Numbered Steps ---
    let rightY = bodyStartY;
    let isOverflowPage = false;

    const ensureRightSpace = (neededMm: number) => {
      if (rightY + neededMm > pageHeight - 24) {
        drawPageNumber(doc.getNumberOfPages(), 'left');
        doc.addPage();
        isOverflowPage = true;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.2);
        doc.setTextColor(...inkSoft);
        doc.text(`${recipe.category.toUpperCase()}  ·  ${recipe.title}`, marginX, 18);
        rightY = 30;
      }
    };

    const drawColX = () => (isOverflowPage ? marginX : rightX);
    const drawColW = () => (isOverflowPage ? contentWidth : rightW);

    // Italic editorial intro paragraphs (story + subtitle + chef's notes styled as italic intro like Photo 1)
    const italicParagraphs: string[] = [];
    if (recipe.story.trim()) {
      italicParagraphs.push(...recipe.story.trim().split(/\n\s*\n/).filter(Boolean));
    } else if (recipe.subtitle.trim()) {
      italicParagraphs.push(recipe.subtitle.trim());
    }
    if (recipe.notes.trim()) {
      italicParagraphs.push(recipe.notes.trim());
    }

    if (italicParagraphs.length > 0) {
      doc.setFont('helvetica', 'oblique');
      doc.setFontSize(9.5);
      doc.setTextColor(...inkBlack);

      for (const para of italicParagraphs) {
        const lines = doc.splitTextToSize(para.trim(), drawColW());
        ensureRightSpace(lines.length * 4.6 + 4);
        doc.setFont('helvetica', 'oblique');
        doc.setFontSize(9.5);
        doc.setTextColor(...inkBlack);
        doc.text(lines, drawColX(), rightY);
        rightY += lines.length * 4.6 + 4;
      }
      rightY += 3;
    }

    // Numbered preparation steps with inline bold '1.', '2.', '3.' (exact match to Photos 1 & 3)
    recipe.steps.forEach((step, idx) => {
      const cleanStep = step.trim();
      if (!cleanStep) return;
      const prefix = `${idx + 1}. `;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);

      const fullLines = doc.splitTextToSize(`${prefix}${cleanStep}`, drawColW());
      ensureRightSpace(fullLines.length * 4.7 + 4);

      const x0 = drawColX();
      const firstLine = fullLines[0] || '';
      const restOfFirstLine = firstLine.startsWith(prefix)
        ? firstLine.slice(prefix.length)
        : firstLine;

      // Draw bold step numeral inline
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...inkBlack);
      doc.text(prefix, x0, rightY);
      const prefixW = doc.getTextWidth(prefix);

      // Draw rest of first line in regular weight
      doc.setFont('helvetica', 'normal');
      doc.text(restOfFirstLine, x0 + prefixW, rightY);
      rightY += 4.7;

      // Remaining lines of this step
      for (let i = 1; i < fullLines.length; i++) {
        ensureRightSpace(5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(...inkBlack);
        doc.text(fullLines[i], drawColX(), rightY);
        rightY += 4.7;
      }

      rightY += 4.2;
    });

    // Optional Family Comments (clean italic attribution below steps)
    const recipeComments = commentsByRecipe[recipe.id] || [];
    if (settings.includeComments && recipeComments.length > 0) {
      rightY += 3;
      ensureRightSpace(14);
      doc.setDrawColor(...ruleGrey);
      doc.setLineWidth(0.2);
      doc.line(drawColX(), rightY, drawColX() + 26, rightY);
      rightY += 5.5;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(...inkSoft);
      doc.text('FAMILIENOTITIES', drawColX(), rightY, { charSpace: 0.7 });
      rightY += 5;

      for (const cmt of recipeComments) {
        doc.setFont('helvetica', 'oblique');
        doc.setFontSize(8.8);
        const cLines = doc.splitTextToSize(
          `${cmt.text} — ${cmt.authorName}`,
          drawColW()
        );
        ensureRightSpace(cLines.length * 4.3 + 3);
        doc.setFont('helvetica', 'oblique');
        doc.setFontSize(8.8);
        doc.setTextColor(...inkSoft);
        doc.text(cLines, drawColX(), rightY);
        rightY += cLines.length * 4.3 + 3;
      }
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
  doc.setTextColor(20, 83, 45);
  doc.text('TAFELBOEK · COMPACTE BOODSCHAPPENLIJST', marginX, headerY, { charSpace: 1 });

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
