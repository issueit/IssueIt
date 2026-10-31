import { useEffect, useState } from "react";
import { IconButton } from "../../components/ui/Button";
import { AltArrowLeftIcon, AltArrowRightIcon, CloseIcon, DownloadMinimalisticIcon } from "../../components/ui/icons";

/**
 * A screenshot at full size. Bug reports are mostly pictures of things being
 * wrong, and a 280px preview is not enough to see what somebody is pointing
 * at. Arrow keys move between the report's images.
 */
export function Lightbox({
  images,
  startAt,
  onClose,
}: {
  images: Array<{ id: string; filename: string; url: string }>;
  startAt: number;
  onClose: () => void;
}) {
  const [at, setAt] = useState(startAt);
  const image = images[at];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setAt((i) => Math.min(i + 1, images.length - 1));
      if (e.key === "ArrowLeft") setAt((i) => Math.max(i - 1, 0));
    };
    document.addEventListener("keydown", onKey);
    // The page behind mustn't scroll while this is over it.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [images.length, onClose]);

  if (!image) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={image.filename}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <header className="flex items-center gap-2 px-3 h-12 shrink-0 text-white">
        <span className="text-sm truncate">{image.filename}</span>
        {images.length > 1 && (
          <span className="text-xs text-white/60 tabular">
            {at + 1} of {images.length}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <a
            href={`${image.url}?download=1`}
            className="btn btn--sm btn--quiet !text-white hover:!bg-white/15"
            download={image.filename}
            onClick={(e) => e.stopPropagation()}
          >
            <DownloadMinimalisticIcon size={14} />
            Download
          </a>
          <IconButton icon={CloseIcon} label="Close" onClick={onClose} className="!text-white hover:!bg-white/15" autoFocus />
        </span>
      </header>

      <div className="flex-1 min-h-0 flex items-center gap-2 px-2 pb-3" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {images.length > 1 && (
          <IconButton
            icon={AltArrowLeftIcon}
            label="Previous image"
            disabled={at === 0}
            onClick={() => setAt((i) => Math.max(i - 1, 0))}
            className="!text-white hover:!bg-white/15 disabled:opacity-30"
          />
        )}
        {/* Click-to-close on the backdrop, not on the picture itself. */}
        <img src={image.url} alt={image.filename} className="flex-1 min-w-0 max-h-full object-contain" />
        {images.length > 1 && (
          <IconButton
            icon={AltArrowRightIcon}
            label="Next image"
            disabled={at === images.length - 1}
            onClick={() => setAt((i) => Math.min(i + 1, images.length - 1))}
            className="!text-white hover:!bg-white/15 disabled:opacity-30"
          />
        )}
      </div>
    </div>
  );
}
