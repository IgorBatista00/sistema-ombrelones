"use client";
import { Button } from "@/components/ui/button";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container py-28 text-center">
      <h1 className="text-4xl">Algo deu errado</h1>
      <p className="mt-3 text-muted">Tente novamente. Se persistir, fale com nosso comercial.</p>
      <Button className="mt-8" onClick={reset}>Tentar novamente</Button>
    </div>
  );
}
