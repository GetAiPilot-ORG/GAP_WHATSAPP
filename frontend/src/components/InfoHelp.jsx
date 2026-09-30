import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

export default function InfoHelp({
  text,
  side = "top",
  align = "center",
  className = "",
  iconSize = "w-3.5 h-3.5",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 240;
    const gap = 8;
    const padding = 12;

    let placement = side;

    // Flip vertical if too close to top edge of viewport
    if (placement === "top" && rect.top < 80) {
      placement = "bottom";
    }

    // Flip to top if too close to bottom edge of viewport
    if (placement === "bottom" && rect.bottom > window.innerHeight - 80) {
      placement = "top";
    }

    const top = placement === "top" ? rect.top - gap : rect.bottom + gap;

    // Horizontal centering & strict viewport clamping
    let left = rect.left + rect.width / 2;
    if (align === "end" || rect.right > window.innerWidth - 130) {
      left = Math.min(rect.right, window.innerWidth - padding - tooltipWidth / 2);
    } else if (align === "start" || rect.left < 130) {
      left = Math.max(rect.left, padding + tooltipWidth / 2);
    }

    const halfWidth = tooltipWidth / 2;
    left = Math.max(halfWidth + padding, Math.min(window.innerWidth - halfWidth - padding, left));

    setCoords({
      top,
      left,
      placement,
    });
  }, [side, align]);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  if (!text) return null;

  return (
    <span className="inline-flex items-center shrink-0">
      <button
        ref={triggerRef}
        type="button"
        className={`inline-flex items-center justify-center p-0.5 rounded-full text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer shrink-0 focus:outline-none ${className}`}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        aria-label="More information"
      >
        <Info className={iconSize} />
      </button>

      {isOpen &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            style={{
              position: "fixed",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              transform:
                coords.placement === "top"
                  ? "translate(-50%, -100%)"
                  : "translate(-50%, 0)",
              zIndex: 99999,
              pointerEvents: "none",
            }}
            className="w-max max-w-[240px] sm:max-w-[260px] text-xs bg-slate-900/95 text-white backdrop-blur-md border border-slate-700/80 px-3 py-2 rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.35)] leading-relaxed text-left font-normal animate-in fade-in zoom-in-95 duration-150"
          >
            <p className="text-[11px] leading-snug">{text}</p>
          </div>,
          document.body
        )}
    </span>
  );
}
