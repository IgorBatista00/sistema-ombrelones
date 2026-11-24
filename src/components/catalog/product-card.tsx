import Image from "next/image";
import Link from "next/link";
import type { ProductCard as Card } from "@/modules/catalog/queries";
import { ImagePlaceholder } from "@/components/ui/misc";
import { Price } from "./price";

export function ProductCard({ p, locked }: { p: Card; locked: boolean }) {
  const avail = p.stockLabel;
  return (
    <article className="group">
      <Link href={`/produtos/${p.slug}`} className="block">
        <div className="relative aspect-[4/5] overflow-hidden rounded bg-white">
          {p.image
            ? <Image src={p.image.url} alt={p.image.alt} fill sizes="(min-width:1024px) 25vw, 50vw" className="object-contain p-3 transition-transform duration-700 ease-soft group-hover:scale-[1.03]" />
            : <ImagePlaceholder label={`Foto de ${p.name} pendente`} />}
        </div>
        <div className="mt-4 space-y-1">
          <p className="label">{p.category.name}</p>
          <h3 className="font-sans text-[15px] leading-snug">{p.name}</h3>
          <p className="text-xs text-muted">
            SKU {p.sku}{p.sizeLabel && <> · {p.sizeLabel}</>}
          </p>
          <p className={`text-xs ${p.availability.state === "in_stock" ? "text-success" : "text-muted"}`}>{avail}</p>
        </div>
      </Link>
      <div className="mt-3"><Price cents={p.priceCents} locked={locked} /></div>
    </article>
  );
}
