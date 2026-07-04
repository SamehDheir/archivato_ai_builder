'use client';

import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { buildErd, buildErdDrawio, type DatabaseDesign } from '@archivato/shared';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/shared/toast';
import { MermaidView } from '@/components/design/MermaidView';
import {
  downloadString,
  exportPngFile,
  exportSvgFile,
  printSvgAsPdf,
} from '@/lib/diagram-export';

/**
 * The ER diagram with a multi-format export toolbar. Mermaid renders the SVG
 * client-side; the toolbar exports it as **Mermaid source, Draw.io (editable
 * mxGraph tables), SVG, PNG, or PDF** — all offline, no backend.
 */
export function ErDiagram({
  design,
  basename,
}: {
  design: DatabaseDesign;
  /** File name without extension, e.g. `erd-<sessionId>`. */
  basename: string;
}) {
  const { t } = useTranslation('stages');
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);

  /** The rendered SVG element, once Mermaid has drawn it. */
  const getSvg = (): SVGSVGElement | null =>
    ref.current?.querySelector('svg') ?? null;

  /** The current (theme-aware) diagram background, for opaque exports. */
  const backgroundOf = (svg: SVGSVGElement): string => {
    const host = svg.parentElement;
    const bg = host ? getComputedStyle(host).backgroundColor : '';
    return bg || '#ffffff';
  };

  const notReady = () =>
    toast({ title: t('erd.notReady'), variant: 'error' });

  const onSvg = () => {
    const svg = getSvg();
    if (!svg) return notReady();
    exportSvgFile(svg, `${basename}.svg`, backgroundOf(svg));
  };

  const onPng = async () => {
    const svg = getSvg();
    if (!svg) return notReady();
    try {
      await exportPngFile(svg, `${basename}.png`, backgroundOf(svg));
    } catch (e) {
      toast({
        title: t('erd.exportFailed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  };

  const onPdf = () => {
    const svg = getSvg();
    if (!svg) return notReady();
    if (!printSvgAsPdf(svg, basename, backgroundOf(svg))) {
      toast({ title: t('erd.popupBlocked'), variant: 'error' });
    }
  };

  return (
    <div className="space-y-2">
      <div ref={ref}>
        <MermaidView code={buildErd(design)} />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="me-1 text-xs font-medium text-muted-foreground">
          {t('erd.export')}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            downloadString(buildErdDrawio(design), `${basename}.drawio`, 'application/xml')
          }
          title={t('erd.drawioTitle')}
        >
          <Download /> {t('erd.drawio')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onPng}>
          {t('erd.png')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onSvg}>
          {t('erd.svg')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onPdf}>
          {t('erd.pdf')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            downloadString(buildErd(design), `${basename}.mmd`, 'text/plain')
          }
        >
          {t('erd.mermaid')}
        </Button>
      </div>
    </div>
  );
}
