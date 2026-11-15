/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Minimal Word (.docx) writer — no external libraries.
 * Supports: headings, paragraphs, two-column tables, photo grids (JPEG/PNG),
 * a header with the logo and title, and a footer with page numbers.
 * The package is a store-only ZIP (Word reads it without compression).
 */

export type DocxBlock =
  | { kind: 'title'; text: string; sub?: string }
  | { kind: 'h1'; text: string }
  | { kind: 'h2'; text: string }
  | { kind: 'p'; text: string; italic?: boolean; small?: boolean }
  | { kind: 'table'; rows: string[][]; header?: boolean; widths?: number[] }
  | { kind: 'photos'; items: { data: Uint8Array; type: 'jpeg' | 'png'; width: number; height: number; caption: string }[] }
  | { kind: 'pagebreak' };

export interface DocxInput {
  title: string;
  headerText: string;
  footerText: string;
  logo?: { data: Uint8Array; type: 'jpeg' | 'png'; width: number; height: number };
  blocks: DocxBlock[];
}

// ------------------------------------------------------------ zip (store)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true); // UTF-8 names
    lh.setUint16(8, 0, true); // stored
    lh.setUint16(10, 0, true);
    lh.setUint16(12, 0x21, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, f.data.length, true);
    lh.setUint32(22, f.data.length, true);
    lh.setUint16(26, name.length, true);
    lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, 0, true);
    ch.setUint16(14, 0x21, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, f.data.length, true);
    ch.setUint32(24, f.data.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0));
  let p = 0;
  all.forEach((b) => {
    out.set(b, p);
    p += b.length;
  });
  return out;
}

// ------------------------------------------------------------ WordprocessingML
const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // characters not allowed in XML 1.0
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const NAVY = '0A1140';
const ACCENT = '7B4DFF';
const MUTED = '68738A';
const EMU_PER_PX = 9525;

function run(text: string, opts: { b?: boolean; i?: boolean; sz?: number; color?: string } = {}): string {
  const rpr = [opts.b ? '<w:b/>' : '', opts.i ? '<w:i/>' : '', opts.color ? `<w:color w:val="${opts.color}"/>` : '', opts.sz ? `<w:sz w:val="${opts.sz}"/><w:szCs w:val="${opts.sz}"/>` : ''].join('');
  const lines = text.split('\n');
  return lines.map((l, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(l)}</w:t></w:r>`).join('');
}
const para = (inner: string, style?: string, extraPPr = '') => `<w:p>${style || extraPPr ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extraPPr}</w:pPr>` : ''}${inner}</w:p>`;

function drawing(rid: string, id: number, wPx: number, hPx: number, name: string): string {
  const cx = Math.round(wPx * EMU_PER_PX);
  const cy = Math.round(hPx * EMU_PER_PX);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${esc(name)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${esc(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

const BORDERS = `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="D9DCE3"/>`).join('')}</w:tblBorders>`;
const CONTENT_TWIPS = 9638; // A4 width minus 2 cm margins each side

function table(rows: string[][], header: boolean, widths?: number[]): string {
  const cols = Math.max(...rows.map((r) => r.length));
  const w = widths && widths.length === cols ? widths : Array.from({ length: cols }, () => 1);
  const tot = w.reduce((s, x) => s + x, 0);
  const tw = w.map((x) => Math.round((x / tot) * CONTENT_TWIPS));
  const grid = `<w:tblGrid>${tw.map((x) => `<w:gridCol w:w="${x}"/>`).join('')}</w:tblGrid>`;
  const body = rows
    .map((r, ri) => {
      const isHead = header && ri === 0;
      const cells = Array.from({ length: cols }, (_, ci) => {
        const t = r[ci] ?? '';
        const shade = isHead ? `<w:shd w:val="clear" w:color="auto" w:fill="${NAVY}"/>` : !header && ci === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="F4F5F8"/>' : '';
        return `<w:tc><w:tcPr><w:tcW w:w="${tw[ci]}" w:type="dxa"/>${shade}</w:tcPr>${para(run(t, { b: isHead || (!header && ci === 0), color: isHead ? 'FFFFFF' : undefined, sz: 19 }), undefined, '<w:spacing w:before="40" w:after="40"/>')}</w:tc>`;
      }).join('');
      return `<w:tr>${isHead ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells}</w:tr>`;
    })
    .join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${CONTENT_TWIPS}" w:type="dxa"/>${BORDERS}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>${grid}${body}</w:tbl>${para('', undefined, '<w:spacing w:after="80"/>')}`;
}

export function buildDocx(input: DocxInput): Blob {
  const enc = new TextEncoder();
  const media: { name: string; data: Uint8Array; type: 'jpeg' | 'png'; rid: string }[] = [];
  let pid = 10;
  const addMedia = (data: Uint8Array, type: 'jpeg' | 'png') => {
    const rid = `rIdImg${media.length + 1}`;
    const name = `image${media.length + 1}.${type === 'png' ? 'png' : 'jpeg'}`;
    media.push({ name, data, type, rid });
    return rid;
  };

  const body: string[] = [];
  for (const b of input.blocks) {
    if (b.kind === 'title') {
      body.push(para(run(b.text), 'Title'));
      if (b.sub) body.push(para(run(b.sub, { color: MUTED }), 'Subtitle'));
    } else if (b.kind === 'h1') body.push(para(run(b.text), 'Heading1'));
    else if (b.kind === 'h2') body.push(para(run(b.text), 'Heading2'));
    else if (b.kind === 'p') {
      b.text
        .split(/\n{2,}/)
        .filter((x) => x.trim())
        .forEach((t) => body.push(para(run(t, { i: b.italic, sz: b.small ? 18 : undefined, color: b.small ? MUTED : undefined }))));
    } else if (b.kind === 'table') body.push(table(b.rows, !!b.header, b.widths));
    else if (b.kind === 'pagebreak') body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    else if (b.kind === 'photos') {
      // two photos per row, each max 300 × 225 px
      for (let i = 0; i < b.items.length; i += 2) {
        const pair = b.items.slice(i, i + 2);
        const cells = pair
          .map((ph) => {
            const k = Math.min(300 / ph.width, 225 / ph.height, 1);
            const rid = addMedia(ph.data, ph.type);
            const img = drawing(rid, pid++, Math.round(ph.width * k), Math.round(ph.height * k), `Photo ${i + 1}`);
            return `<w:tc><w:tcPr><w:tcW w:w="${CONTENT_TWIPS / 2}" w:type="dxa"/></w:tcPr>${para(img, undefined, '<w:jc w:val="center"/><w:spacing w:before="60" w:after="40"/>')}${para(run(ph.caption, { sz: 17, color: MUTED }), undefined, '<w:jc w:val="center"/><w:spacing w:after="80"/>')}</w:tc>`;
          })
          .join('');
        const pad = pair.length === 1 ? `<w:tc><w:tcPr><w:tcW w:w="${CONTENT_TWIPS / 2}" w:type="dxa"/></w:tcPr><w:p/></w:tc>` : '';
        body.push(`<w:tbl><w:tblPr><w:tblW w:w="${CONTENT_TWIPS}" w:type="dxa"/>${BORDERS}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="${CONTENT_TWIPS / 2}"/><w:gridCol w:w="${CONTENT_TWIPS / 2}"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${cells}${pad}</w:tr></w:tbl>`);
      }
      body.push('<w:p/>');
    }
  }

  const NS =
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

  let headerLogo = '';
  let logoRid = '';
  if (input.logo) {
    logoRid = 'rIdLogo';
    const k = Math.min(42 / input.logo.height, 1);
    headerLogo = drawing(logoRid, 2, Math.round(input.logo.width * k), Math.round(input.logo.height * k), 'Convengers logo');
  }
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}>${para(
    `${headerLogo}<w:r><w:tab/></w:r>${run(input.headerText, { b: true, color: NAVY, sz: 18 })}`,
    'Header',
    `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="${NAVY}"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="${CONTENT_TWIPS}"/></w:tabs>`
  )}</w:hdr>`;
  const fr = `<w:rPr><w:color w:val="${MUTED}"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>`;
  const field = (instr: string) => `<w:r>${fr}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${fr}<w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r>${fr}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${fr}<w:t>1</w:t></w:r><w:r>${fr}<w:fldChar w:fldCharType="end"/></w:r>`;
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}>${para(
    `${run(input.footerText, { sz: 16, color: MUTED })}<w:r><w:tab/></w:r>${run('Page ', { sz: 16, color: MUTED })}${field('PAGE')}${run(' of ', { sz: 16, color: MUTED })}${field('NUMPAGES')}`,
    'Footer',
    `<w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="D9DCE3"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="${CONTENT_TWIPS}"/></w:tabs>`
  )}</w:ftr>`;

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body.join('')}<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1300" w:right="1134" w:bottom="1200" w:left="1134" w:header="560" w:footer="560" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:color w:val="172033"/><w:lang w:val="en-PH"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="left"/><w:spacing w:after="60"/></w:pPr><w:rPr><w:b/><w:color w:val="${NAVY}"/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="left"/><w:spacing w:after="240"/></w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:jc w:val="left"/><w:spacing w:before="280" w:after="100"/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="2" w:color="${ACCENT}"/></w:pBdr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="${NAVY}"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:jc w:val="left"/><w:spacing w:before="160" w:after="60"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="${ACCENT}"/><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="left"/><w:spacing w:after="0"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="left"/><w:spacing w:after="0"/></w:pPr></w:style>
</w:styles>`;

  const rels = [
    `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    `<Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>`,
    `<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`,
    ...media.map((m) => `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`),
  ];
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`;
  const logoName = input.logo ? `logo.${input.logo.type === 'png' ? 'png' : 'jpeg'}` : '';
  const headerRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${input.logo ? `<Relationship Id="${logoRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${logoName}"/>` : ''}</Relationships>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(input.title)}</dc:title><dc:creator>Convengers Bahay Build</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`;

  const files = [
    { name: '[Content_Types].xml', data: enc.encode(types) },
    { name: '_rels/.rels', data: enc.encode(rootRels) },
    { name: 'docProps/core.xml', data: enc.encode(core) },
    { name: 'word/document.xml', data: enc.encode(document) },
    { name: 'word/styles.xml', data: enc.encode(styles) },
    { name: 'word/header1.xml', data: enc.encode(header) },
    { name: 'word/footer1.xml', data: enc.encode(footer) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(docRels) },
    { name: 'word/_rels/header1.xml.rels', data: enc.encode(headerRels) },
    ...(input.logo ? [{ name: `word/media/${logoName}`, data: input.logo.data }] : []),
    ...media.map((m) => ({ name: `word/media/${m.name}`, data: m.data })),
  ];
  const zip = zipStore(files);
  return new Blob([zip as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/** Load an image URL (object URL or same-origin path) as JPEG bytes with its size, for embedding. */
export async function imageForDocx(src: string, maxPx = 1400): Promise<{ data: Uint8Array; type: 'jpeg'; width: number; height: number } | null> {
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    await img.decode();
    const k = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) return null;
    return { data: new Uint8Array(await blob.arrayBuffer()), type: 'jpeg', width: w, height: h };
  } catch {
    return null;
  }
}
