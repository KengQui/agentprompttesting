import { useCallback, useEffect, useRef, useState } from "react";

interface UseResizableOptions {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  direction?: "left" | "right";
  storageKey?: string;
}

export function useResizable({
  initialWidth,
  minWidth,
  maxWidth,
  direction = "left",
  storageKey,
}: UseResizableOptions) {
  const [width, setWidth] = useState(() => {
    if (storageKey) {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
          return parsed;
        }
      }
    }
    return initialWidth;
  });

  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      startX.current = e.clientX;
      startWidth.current = width;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta =
        direction === "left"
          ? e.clientX - startX.current
          : startX.current - e.clientX;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth.current + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (storageKey) {
        localStorage.setItem(storageKey, String(width));
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [direction, minWidth, maxWidth, storageKey, width]);

  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(storageKey, String(width));
    }
  }, [width, storageKey]);

  return { width, handleMouseDown };
}

interface ResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
}

export function ResizeHandle({ onMouseDown }: ResizeHandleProps) {
  return (
    <div
      className="relative w-0 shrink-0 group"
      data-testid="resize-handle"
    >
      <div
        onMouseDown={onMouseDown}
        className="absolute inset-y-0 -left-[3px] w-[6px] z-30 cursor-col-resize flex items-center justify-center"
      >
        <div className="w-[2px] h-full bg-transparent group-hover:bg-primary/30 transition-colors" />
      </div>
    </div>
  );
}
