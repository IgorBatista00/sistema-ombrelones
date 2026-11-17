"use client";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ImagePlaceholder } from "@/components/ui/misc";
import { ChevronIcon, CloseIcon } from "@/components/ui/icons";

type Img = { id: string; url: string; alt: string; variantId: string | null };

export function Gallery({ images, name }: { images: Img[]; name: string }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const go = useCallback((d: number) => setIndex((i) => (i + d + images.length) % images.length), [images.length]);

  // Seleção de variação dispara troca de imagem (evento emitido pelo BuyBox)
  useEffect(() => {
    const h = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const i = images.findIndex((img) => img.variantId === id);
      if (i >= 0) setIndex(i);
    };
    window.addEventListener("variant-change", h);
    return () => window.removeEventListener("variant-change", h);
  }, [images]);

  useEffect(() => {
    if (!zoom) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(false); if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); };
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [zoom, go]);

  if (images.length === 0) {
    return <div className="aspect-[4/5] overflow-hidden rounded"><ImagePlaceholder label={`Fotos de ${name} pendentes`} /></div>;
  }
  const current = images[index];

  return (
    <div className="flex flex-col-reverse gap-3 md:flex-row">
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto md:w-20 md:flex-col" role="tablist" aria-label="Miniaturas">
          {images.map((img, i) => (
            <button key={img.id} role="tab" aria-selected={i === index} aria-label={`Imagem ${i + 1}`} onClick={() => setIndex(i)}
              className={`relative aspect-square w-16 shrink-0 overflow-hidden rounded border md:w-full ${i === index ? "border-ink" : "border-transparent opacity-70 hover:opacity-100"}`}>
              <Image src={img.url} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
      <div className="relative flex-1">
        <button className="relative block aspect-[4/5] w-full cursor-zoom-in overflow-hidden rounded bg-[#ece8e1]" onClick={() => setZoom(true)} aria-label="Ampliar imagem">
          <Image key={current.id} src={current.url} alt={current.alt} fill priority sizes="(min-width:1024px) 55vw, 100vw" className="object-cover fade-in" />
        </button>
        {images.length > 1 && (
          <>
            <NavBtn dir={-1} onClick={() => go(-1)} />
            <NavBtn dir={1} onClick={() => go(1)} />
          </>
        )}
      </div>

      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/95 fade-in" role="dialog" aria-modal="true" aria-label="Imagem ampliada" onClick={() => setZoom(false)}>
          <div className="relative h-[90vh] w-[94vw]" onClick={(e) => e.stopPropagation()}>
            <Image src={current.url} alt={current.alt} fill sizes="100vw" className="object-contain" />
          </div>
          <button className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center text-canvas" aria-label="Fechar" onClick={() => setZoom(false)}><CloseIcon /></button>
          {images.length > 1 && <><NavBtn dir={-1} dark onClick={(e) => { e.stopPropagation(); go(-1); }} /><NavBtn dir={1} dark onClick={(e) => { e.stopPropagation(); go(1); }} /></>}
        </div>
      )}
    </div>
  );
}

function NavBtn({ dir, onClick, dark }: { dir: 1 | -1; onClick: (e: React.MouseEvent) => void; dark?: boolean }) {
  return (
    <button onClick={onClick} aria-label={dir === 1 ? "Próxima imagem" : "Imagem anterior"}
      className={`absolute top-1/2 -translate-y-1/2 ${dir === 1 ? "right-3" : "left-3"} flex h-10 w-10 items-center justify-center rounded-full ${dark ? "text-canvas" : "bg-canvas/80 backdrop-blur hover:bg-canvas"}`}>
      <ChevronIcon className={dir === -1 ? "rotate-180" : ""} />
    </button>
  );
}
