'use client';

import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';
// Dark-theme overrides, imported AFTER the base CSS so they win.
import './swagger-dark.css';

/**
 * Thin client-only wrapper around swagger-ui-react so the heavy library + its
 * CSS are pulled into a dynamically-imported chunk (see OpenApiView). The base
 * Swagger UI theme is light; swagger-dark.css recolors it to match the app.
 */
export default function SwaggerUiClient({
  spec,
}: {
  spec: Record<string, unknown>;
}) {
  return <SwaggerUI spec={spec} />;
}
