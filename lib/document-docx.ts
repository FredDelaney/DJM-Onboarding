import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  DOCUMENT_TEMPLATES,
  documentBrief,
  documentMoney,
  documentPrice,
  invoiceTotals,
  resolveDocumentText,
  safeDocumentUrl,
  type AgencyDocument,
} from "./agency-documents";
import {
  documentBriefColumns,
  documentCoverLead,
  documentTheme,
  isDocumentSigningBlock,
} from "./document-presentation";

export async function createDocumentWord(
  doc: AgencyDocument,
  logo?: { bytes: Uint8Array; width: number; height: number },
): Promise<Blob> {
  const { content, kind } = doc,
    { brand } = content,
    theme = documentTheme(brand),
    primary = theme.primary.slice(1),
    muted = "60717A",
    isPitch = kind === "agency_pitch",
    isReport = kind === "scouting_report";
  const text = (value: string, size = 22, bold = false, color = "263740") =>
    new TextRun({ text: value, size, bold, color, font: "Arial" });
  const para = (
    value: string,
    before = 0,
    keepNext = false,
    keepLines = false,
  ) =>
    new Paragraph({
      children: value.split("\n").map(
        (line, index) =>
          new TextRun({
            text: line,
            break: index ? 1 : undefined,
            font: "Arial",
            size: isPitch ? 32 : isReport ? 21 : 22,
            color: "263740",
          }),
      ),
      spacing: {
        before,
        after: isPitch ? 240 : isReport ? 120 : 170,
        line: isPitch ? 360 : isReport ? 294 : 310,
      },
      keepNext,
      keepLines,
      ...(isPitch ? { indent: { right: 1800 } } : {}),
    });
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      children: [
        text(DOCUMENT_TEMPLATES[kind].label.toUpperCase(), 18, true, muted),
      ],
      spacing: { before: isPitch ? 1000 : 200, after: 200 },
    }),
    new Paragraph({
      text: doc.title,
      heading: HeadingLevel.TITLE,
      spacing: { after: isPitch ? 500 : 260 },
    }),
  ];
  if (!content.reviewed)
    children.push(
      new Paragraph({
        children: [text("DRAFT FOR REVIEW", 18, true, "8A5B20")],
        spacing: { after: 260 },
      }),
    );
  const brief = documentBrief(doc);
  if (documentCoverLead(doc))
    children.push(
      new Paragraph({
        children: [text(documentCoverLead(doc), 28, false, "52645E")],
        spacing: { before: 180, after: 260, line: 380 },
      }),
    );
  if (brief.length) {
    const columns = documentBriefColumns(kind, brief.length);
    const none = { style: BorderStyle.NONE };
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: Array(columns).fill(
          Math.floor((isPitch ? 14638 : 9706) / columns),
        ),
        borders: {
          top: none,
          bottom: none,
          left: none,
          right: none,
          insideHorizontal: none,
          insideVertical: none,
        },
        rows: Array.from(
          { length: Math.ceil(brief.length / columns) },
          (_, row) =>
            new TableRow({
              children: Array.from({ length: columns }, (_, column) => {
                const item = brief[row * columns + column];
                return new TableCell({
                  width: { size: 100 / columns, type: WidthType.PERCENTAGE },
                  margins: { top: isReport ? 80 : 120, bottom: isReport ? 120 : 180, left: 0, right: 200 },
                  children: item
                    ? [
                        new Paragraph({
                          children: [text(item.label, 16, false, muted)],
                          spacing: { after: 80 },
                        }),
                        new Paragraph({
                          children: item.value.split("\n").map(
                            (line, index) =>
                              new TextRun({
                                text: line,
                                break: index ? 1 : undefined,
                                size: isPitch ? 26 : 21,
                                color: primary,
                                font: "Arial",
                              }),
                          ),
                          spacing: { after: 80 },
                        }),
                      ]
                    : [new Paragraph("")],
                });
              }),
            }),
        ),
      }),
      new Paragraph({ spacing: { after: 100 } }),
    );
  }
  if (kind === "invoice") {
    children.push(
      para(`Invoice ${content.fields.invoice_number || "[invoice number]"}`),
      para(`Bill to: ${content.fields.recipient_name || "[recipient]"}`),
      para(content.fields.recipient_address || "[billing address]"),
      para(
        `Issued ${content.fields.issue_date || "[date]"}   ·   Due ${content.fields.due_date || "[date]"}`,
      ),
    );
    const totals = invoiceTotals(content);
    const row = (values: string[], head = false) =>
      new TableRow({
        tableHeader: head,
        cantSplit: true,
        children: values.map(
          (value, index) =>
            new TableCell({
              width: {
                size: [46, 12, 21, 21][index],
                type: WidthType.PERCENTAGE,
              },
              children: [
                new Paragraph({
                  children: [text(value, 20, head, head ? "FFFFFF" : "263740")],
                  spacing: { before: 100, after: 100 },
                  alignment:
                    index === 0 ? AlignmentType.LEFT : AlignmentType.RIGHT,
                }),
              ],
              shading: { fill: head ? primary : "F3F5F5" },
              margins: { left: 160, right: 160 },
            }),
        ),
      });
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [4465, 1165, 2038, 2038],
        rows: [
          row(["Description", "Quantity", "Unit price", "Amount"], true),
          ...content.lines.map((line, index) =>
            row([
              line.description || "[service]",
              line.quantity,
              documentPrice(line.unitPrice, content),
              totals.valid
                ? documentMoney(totals.amounts[index], content)
                : "[amount]",
            ]),
          ),
        ],
        borders: {
          top: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE },
          insideHorizontal: {
            style: BorderStyle.SINGLE,
            color: "FFFFFF",
            size: 8,
          },
          insideVertical: { style: BorderStyle.NONE },
        },
      }),
    );
    children.push(
      para(
        `Subtotal  ${totals.valid ? documentMoney(totals.subtotal, content) : "[amount]"}`,
        160,
      ),
      para(
        `Tax (${content.fields.tax_rate || "0"}%)  ${totals.valid ? documentMoney(totals.tax, content) : "[amount]"}`,
      ),
      new Paragraph({
        children: [
          text(
            `Total due  ${totals.valid ? documentMoney(totals.total, content) : "[complete line items]"}`,
            32,
            true,
            primary,
          ),
        ],
        spacing: { before: 120, after: 300 },
      }),
    );
  }
  content.sections.forEach((section, index) => {
    if (isPitch)
      children.push(
        new Paragraph({
          children: [
            text(
              `${String(index + 1).padStart(2, "0")} / ${String(content.sections.length).padStart(2, "0")}`,
              18,
              false,
              muted,
            ),
          ],
          pageBreakBefore: index === 0 || !!section.pageBreak,
          keepNext: true,
          spacing: { before: 400, after: 220 },
        }),
      );
    children.push(
      new Paragraph({
        text: resolveDocumentText(section.title, content),
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: !isPitch && !!section.pageBreak,
        spacing: { before: isPitch ? 0 : isReport ? 160 : 240, after: isPitch ? 340 : isReport ? 80 : 150 },
      }),
    );
    const body = resolveDocumentText(section.body, content);
    const paragraphs = body.split(/\n{2,}/);
    const signing = isDocumentSigningBlock(body);
    paragraphs.forEach((line, index) =>
      children.push(
        para(line, 0, signing && index < paragraphs.length - 1, signing),
      ),
    );
  });
  if (kind === "invoice") {
    if (brand.bankDetails)
      children.push(
        new Paragraph({
          text: "Bank details",
          heading: HeadingLevel.HEADING_1,
        }),
        para(brand.bankDetails),
      );
    const link = safeDocumentUrl(content.fields.payment_url);
    if (link)
      children.push(
        new Paragraph({
          children: [
            new ExternalHyperlink({
              link,
              children: [text(`Pay online: ${link}`, 22, false, primary)],
            }),
          ],
          spacing: { after: 170 },
        }),
      );
  }
  if (content.sources.length)
    children.push(
      new Paragraph({ text: "Sources", heading: HeadingLevel.HEADING_1 }),
      ...content.sources.map(
        (source) =>
          new Paragraph({
            children: [
              safeDocumentUrl(source.url)
                ? new ExternalHyperlink({
                    link: safeDocumentUrl(source.url),
                    children: [text(source.label, 18, false, primary)],
                  })
                : text(source.label, 18),
              text(
                ` · Added ${source.capturedAt.slice(0, 10)}`,
                18,
                false,
                muted,
              ),
              ...(safeDocumentUrl(source.url)
                ? [
                    new TextRun({
                      text: source.url,
                      break: 1,
                      size: 16,
                      color: muted,
                    }),
                  ]
                : []),
            ],
            spacing: { after: 170 },
          }),
      ),
    );
  if (
    ["player_contract", "mandate", "invoice"].includes(kind) &&
    (brand.address || brand.registration)
  )
    children.push(
      new Paragraph({
        text: "Agency details",
        heading: HeadingLevel.HEADING_1,
      }),
      para(
        [brand.legalName || brand.name, brand.address, brand.registration]
          .filter(Boolean)
          .join("\n"),
        0,
        false,
        true,
      ),
    );
  const contact = [
    brand.legalName || brand.name,
    brand.email,
    brand.phone,
    brand.website,
  ]
    .filter(Boolean)
    .join(" · ");
  const file = new Document({
    creator: brand.name,
    title: doc.title,
    description: DOCUMENT_TEMPLATES[kind].label,
    styles: {
      default: {
        document: { run: { font: "Arial", size: 22, color: "263740" } },
      },
      paragraphStyles: [
        {
          id: "Title",
          name: "Title",
          basedOn: "Normal",
          next: "Normal",
          run: {
            font: "Georgia",
            size: isPitch ? 92 : 58,
            bold: false,
            color: primary,
          },
          paragraph: { spacing: { after: 220 } },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          run: {
            font: isPitch ? "Georgia" : "Arial",
            size: isPitch ? 64 : isReport ? 26 : 28,
            bold: !isPitch,
            color: primary,
          },
          paragraph: { keepNext: true },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size:
              kind === "agency_pitch"
                ? { width: 16838, height: 11906 }
                : { width: 11906, height: 16838 },
            margin: {
              top: 1500,
              bottom: 1200,
              left: 1100,
              right: 1100,
              header: 350,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                columnWidths: logo
                  ? [isPitch ? 12438 : 7506, 2200]
                  : [isPitch ? 14638 : 9706],
                borders: {
                  top: { style: BorderStyle.NONE },
                  bottom: {
                    style: BorderStyle.SINGLE,
                    color: theme.accent.slice(1),
                    size: 12,
                  },
                  left: { style: BorderStyle.NONE },
                  right: { style: BorderStyle.NONE },
                  insideHorizontal: { style: BorderStyle.NONE },
                  insideVertical: { style: BorderStyle.NONE },
                },
                rows: [
                  new TableRow({
                    cantSplit: true,
                    children: [
                      new TableCell({
                        shading: { fill: theme.surface.slice(1) },
                        verticalAlign: "center",
                        margins: {
                          top: 100,
                          bottom: 100,
                          left: 160,
                          right: 160,
                        },
                        children: [
                          new Paragraph({
                            children: [text(brand.name, 26, true, primary)],
                            spacing: { before: 0, after: 0 },
                          }),
                        ],
                      }),
                      ...(logo
                        ? [
                            new TableCell({
                              shading: { fill: theme.surface.slice(1) },
                              margins: {
                                top: 100,
                                bottom: 100,
                                left: 160,
                                right: 160,
                              },
                              children: [
                                new Paragraph({
                                  alignment: AlignmentType.RIGHT,
                                  children: [
                                    new ImageRun({
                                      type: "png",
                                      data: logo.bytes,
                                      transformation: {
                                        width: logo.width,
                                        height: logo.height,
                                      },
                                    }),
                                  ],
                                  spacing: { before: 0, after: 0 },
                                }),
                              ],
                            }),
                          ]
                        : []),
                    ],
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [text(contact, 16, false, muted)],
                spacing: { after: 100 },
              }),
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    children: [
                      "Page ",
                      PageNumber.CURRENT,
                      " of ",
                      PageNumber.TOTAL_PAGES,
                    ],
                    size: 16,
                    color: muted,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBlob(file);
}
