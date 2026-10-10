import { Maximize, Minimize } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function FullscreenButton() {
  const [visible, setVisible] = useState(true);
  const [full, setFull] = useState(Boolean(document.fullscreenElement));
  useEffect(() => {
    let t = setTimeout(() => setVisible(false), 3000);
    const wake = () => {
      setVisible(true);
      clearTimeout(t);
      t = setTimeout(() => setVisible(false), 3000);
    };
    const onFs = () => setFull(Boolean(document.fullscreenElement));
    window.addEventListener("pointermove", wake);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointermove", wake);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, []);
  if (!document.documentElement.requestFullscreen) return null;
  return (
    <button
      type="button"
      aria-label={full ? "Выйти из полноэкранного режима" : "На весь экран"}
      onClick={() =>
        full ? document.exitFullscreen() : document.documentElement.requestFullscreen()
      }
      className={cn(
        "fixed right-4 bottom-4 z-40 rounded-full bg-black/50 p-3 text-white backdrop-blur transition-opacity",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      {full ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
    </button>
  );
}
