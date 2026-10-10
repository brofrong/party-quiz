import { WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useConnectionState } from "./connection";

export function ConnectionBanner() {
  const state = useConnectionState();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (state === "connected") {
      setShow(false);
      return;
    }
    const t = setTimeout(() => setShow(true), 1200); // no flicker on quick reconnects
    return () => clearTimeout(t);
  }, [state]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="fixed inset-x-0 top-3 z-50 mx-auto flex w-fit items-center gap-2 rounded-full bg-destructive px-4 py-2 text-sm text-white shadow-lg"
        >
          <WifiOff className="size-4" /> Нет связи, переподключаемся…
        </motion.div>
      )}
    </AnimatePresence>
  );
}
