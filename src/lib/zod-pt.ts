import { z } from "zod";

/** Mensagens padrão de validação em português (as específicas ficam nos schemas). */
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case "invalid_type": return { message: issue.received === "undefined" ? "Campo obrigatório" : "Valor inválido" };
    case "too_small": return { message: issue.type === "string" ? `Mínimo de ${issue.minimum} caracteres` : `Valor mínimo: ${issue.minimum}` };
    case "too_big": return { message: issue.type === "string" ? `Máximo de ${issue.maximum} caracteres` : `Valor máximo: ${issue.maximum}` };
    case "invalid_string": return { message: "Formato inválido" };
    case "invalid_enum_value": return { message: "Opção inválida" };
    default: return { message: ctx.defaultError };
  }
});
