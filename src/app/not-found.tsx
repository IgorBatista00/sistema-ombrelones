import { ButtonLink } from "@/components/ui/button";
export default function NotFound() {
  return (
    <div className="container py-28 text-center">
      <p className="label mb-4">404</p>
      <h1 className="text-4xl">Página não encontrada</h1>
      <ButtonLink href="/produtos" className="mt-8">Ver produtos</ButtonLink>
    </div>
  );
}
