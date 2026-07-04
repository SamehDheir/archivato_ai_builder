import type { DatabaseDesign, Entity, Relation } from './database-design';

/**
 * Deterministic draw.io (diagrams.net) builder: turns the Database Design into a
 * `.drawio` mxGraph document with **editable ER tables** — one table shape per
 * entity (a header + a row per column with a PK/FK/UK marker) and an ER edge per
 * relation. Pure + dependency-free (lives in the shared package, used by the web
 * ER-diagram export). Import the result straight into diagrams.net / the VS Code
 * Draw.io extension.
 */

const TABLE_WIDTH = 220;
const HEADER_HEIGHT = 30;
const ROW_HEIGHT = 26;
const KEY_WIDTH = 44;
const GAP_X = 80;
const GAP_Y = 60;
const COLUMNS = 3; // tables per row before wrapping

/** Escape a string for use in an XML attribute value. */
function esc(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A stable, XML-id-safe token from an entity name (+ optional suffix). */
function tableId(name: string, i: number): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, '_') || 'entity';
  return `tbl_${i}_${cleaned}`;
}

function keyMarker(col: Entity['columns'][number]): string {
  if (col.primaryKey) return 'PK';
  if (col.references) return 'FK';
  if (col.unique) return 'UK';
  return '';
}

/** ER edge arrow ends for a relation type: [startArrow, endArrow]. */
function erArrows(rel: Relation): [string, string] {
  switch (rel.type) {
    case 'one-to-one':
      return ['ERone', 'ERone'];
    case 'many-to-many':
      return ['ERmany', 'ERmany'];
    case 'one-to-many':
    default:
      return ['ERone', 'ERmany'];
  }
}

export function buildErdDrawio(db: DatabaseDesign): string {
  const cells: string[] = [
    '<mxCell id="0" />',
    '<mxCell id="1" parent="0" />',
  ];

  // Lay tables out in independent columns so tall tables never overlap.
  const idByEntity = new Map<string, string>();
  const columnY = new Array<number>(COLUMNS).fill(40);

  db.entities.forEach((entity, i) => {
    const id = tableId(entity.name, i);
    idByEntity.set(entity.name, id);

    const col = i % COLUMNS;
    const x = 40 + col * (TABLE_WIDTH + GAP_X);
    const y = columnY[col];
    const rows = Math.max(entity.columns.length, 1);
    const height = HEADER_HEIGHT + rows * ROW_HEIGHT;
    columnY[col] = y + height + GAP_Y;

    // Table container.
    cells.push(
      `<mxCell id="${id}" value="${esc(entity.name)}" ` +
        `style="shape=table;startSize=${HEADER_HEIGHT};container=1;collapsible=0;` +
        `childLayout=tableLayout;fixedRows=1;rowLines=0;fontStyle=1;align=center;resizeLast=1;" ` +
        `vertex="1" parent="1">` +
        `<mxGeometry x="${x}" y="${y}" width="${TABLE_WIDTH}" height="${height}" as="geometry" /></mxCell>`,
    );

    // One row per column, each with a key-marker cell + a name:type cell.
    entity.columns.forEach((column, r) => {
      const rowId = `${id}_r${r}`;
      cells.push(
        `<mxCell id="${rowId}" value="" ` +
          `style="shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;` +
          `strokeColor=inherit;top=0;left=0;bottom=0;right=0;collapsible=0;dropTarget=0;` +
          `fillColor=none;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;fontSize=12;" ` +
          `vertex="1" parent="${id}">` +
          `<mxGeometry y="${HEADER_HEIGHT + r * ROW_HEIGHT}" width="${TABLE_WIDTH}" height="${ROW_HEIGHT}" as="geometry" /></mxCell>`,
      );
      cells.push(
        `<mxCell id="${rowId}_k" value="${esc(keyMarker(column))}" ` +
          `style="shape=partialRectangle;overflow=hidden;connectable=0;fillColor=none;` +
          `top=0;left=0;bottom=0;right=0;fontStyle=1;fontSize=11;" vertex="1" parent="${rowId}">` +
          `<mxGeometry width="${KEY_WIDTH}" height="${ROW_HEIGHT}" as="geometry" /></mxCell>`,
      );
      cells.push(
        `<mxCell id="${rowId}_n" value="${esc(`${column.name} : ${column.type}`)}" ` +
          `style="shape=partialRectangle;overflow=hidden;connectable=0;fillColor=none;` +
          `top=0;left=0;bottom=0;right=0;align=left;spacingLeft=6;fontSize=12;" vertex="1" parent="${rowId}">` +
          `<mxGeometry x="${KEY_WIDTH}" width="${TABLE_WIDTH - KEY_WIDTH}" height="${ROW_HEIGHT}" as="geometry" /></mxCell>`,
      );
    });
  });

  // Relations → ER edges between tables (skip endpoints we didn't lay out).
  db.relations.forEach((rel, i) => {
    const source = idByEntity.get(rel.from);
    const target = idByEntity.get(rel.to);
    if (!source || !target) return;
    const [startArrow, endArrow] = erArrows(rel);
    cells.push(
      `<mxCell id="edge_${i}" value="${esc(rel.description ?? rel.type)}" ` +
        `style="edgeStyle=entityRelationEdgeStyle;fontSize=10;html=1;rounded=0;` +
        `startArrow=${startArrow};endArrow=${endArrow};` +
        `exitX=1;exitY=0.5;entryX=0;entryY=0.5;" ` +
        `edge="1" parent="1" source="${source}" target="${target}">` +
        `<mxGeometry relative="1" as="geometry" /></mxCell>`,
    );
  });

  return (
    `<mxfile host="Archivato" type="device">` +
    `<diagram id="erd" name="ER Diagram">` +
    `<mxGraphModel dx="900" dy="700" grid="1" gridSize="10" guides="1" ` +
    `tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" ` +
    `pageWidth="1169" pageHeight="826" math="0" shadow="0">` +
    `<root>${cells.join('')}</root>` +
    `</mxGraphModel></diagram></mxfile>`
  );
}
