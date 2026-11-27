import { useState } from 'react';
import { BookOpen } from 'lucide-react';

interface RecipeImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
}

export function RecipeImage({ src, alt, className = '', fallbackTitle }: RecipeImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-zinc-100 via-stone-100 to-zinc-200 text-zinc-500 p-6 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <BookOpen className="w-7 h-7 text-zinc-400 mb-2" strokeWidth={1.5} />
        <span className="font-editorial text-sm text-zinc-600 line-clamp-2 max-w-[180px]">
          {fallbackTitle || alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
