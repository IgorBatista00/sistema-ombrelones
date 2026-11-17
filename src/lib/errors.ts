/** Erro de domínio com código estável (exposto ao cliente) e status HTTP. */
export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400, public details?: unknown) {
    super(message);
  }
}

/** Integração externa sem credenciais ou não homologada. Nunca simular sucesso. */
export class IntegrationNotConfiguredError extends AppError {
  constructor(integration: string) {
    super(
      "INTEGRATION_NOT_CONFIGURED",
      `A integração "${integration}" ainda não está operacional. Configure as credenciais e conclua a homologação.`,
      503,
    );
  }
}

export function toErrorResponse(err: unknown) {
  if (err instanceof AppError) {
    return Response.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  console.error(err);
  return Response.json({ error: { code: "INTERNAL", message: "Erro inesperado. Tente novamente." } }, { status: 500 });
}
