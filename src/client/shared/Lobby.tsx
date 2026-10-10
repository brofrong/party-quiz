import { motion } from "motion/react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { pluralRu } from "@/lib/plural";

const JOIN_URL = location.origin;

export function Lobby({ online }: { online: number }) {
  const [qr, setQr] = useState<string>();
  useEffect(() => {
    QRCode.toDataURL(JOIN_URL, { margin: 1, width: 720, errorCorrectionLevel: "M" }).then(setQr);
  }, []);
  return (
    <div
      data-testid="lobby"
      className="party-bg flex h-full flex-col items-center justify-center gap-6 p-6 text-center text-white"
    >
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="font-black text-4xl tracking-tight sm:text-6xl"
      >
        Party Quiz 🎉
      </motion.h1>
      <p className="text-lg text-white/80 sm:text-2xl">
        Наведи камеру на QR-код, чтобы присоединиться
      </p>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", bounce: 0.4 }}
        className="rounded-3xl bg-white p-4 shadow-2xl"
      >
        {qr ? (
          <img src={qr} alt="QR-код для входа" className="size-[min(70vw,46vh)]" />
        ) : (
          <div className="size-[min(70vw,46vh)]" />
        )}
      </motion.div>
      <p className="font-mono text-xl sm:text-3xl">{JOIN_URL.replace(/^https?:\/\//, "")}</p>
      <div className="flex items-center gap-3 rounded-full bg-black/30 px-5 py-2 text-white/90 backdrop-blur">
        <span className="relative flex size-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-3 rounded-full bg-emerald-400" />
        </span>
        Ждём начала · {online} {pluralRu(online, ["устройство", "устройства", "устройств"])}
      </div>
    </div>
  );
}
