import {
  AlignmentType,
  BorderStyle,
  Document,
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
  documentMoney,
  documentPrice,
  invoiceTotals,
  resolveDocumentText,
  safeDocumentUrl,
  type AgencyDocument,
} from "./agency-documents";
import { readableBrandInk } from "./tenant-brand-style";

export async function createDocumentWord(
  doc: AgencyDocument,
  logo?: { bytes: Uint8Array; width: number; height: number },
): Promise<Blob> {
  const { content, kind } = doc,
    { brand } = content,
    primary = readableBrandInk(brand.primary).replace("#", ""),
    muted = "60717A";
  const text = (value: string, size = 22, bold = false, color = "263740") =>
    new TextRun({ text: value, size, bold, color, font: "Arial" });
  const para = (value: string) =>
    new Paragraph({
      children: value
        .split("\n")
        .map(
          (line, index) =>
            new TextRun({
              text: line,
              break: index ? 1 : undefined,
              font: "Arial",
              size: 22,
              color: "263740",
            }),
        ),
      spacing: { after: 170, line: 310 },
    });
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      text: doc.title,
      heading: HeadingLevel.TITLE,
      spacing: { before: 300, after: 160 },
    }),
    new Paragraph({
      children: [
        text(DOCUMENT_TEMPLATES[kind].label.toUpperCase(), 18, true, muted),
      ],
      spacing: { after: 300 },
    }),
  ];
  if (!content.reviewed)
    children.push(
      new Paragraph({
        children: [text("DRAFT FOR REVIEW", 18, true, "8A5B20")],
        spacing: { after: 260 },
      }),
    );
  if (kind === "invoice") {
    children.push(
      para(`Invoice ${content.fields.invoice_number || "[invoice number]"}`),
      para(`Bill to: ${content.fields.recipient_name || "[recipient]"}`),
      para(content.fields.recipient_address || "[billing address]"),
      para(
        `Issued ${content.fields.issue_date || "[date]"}   ·   Due ${content.fields.due_date || "[date]"}`,
      ),
    );
    const totals = invoiceTotals(content),
      currency = content.fields.currency || "EUR";
    const row = (values: string[], head = false) =>
      new TableRow({
        children: values.map(
          (value) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [text(value, 20, head, head ? "FFFFFF" : "263740")],
                  spacing: { before: 100, after: 100 },
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
        rows: [
          row(["Description", "Quantity", "Unit price", "Amount"], true),
          ...content.lines.map((line, index) =>
            row([
              line.description || "[service]",
              line.quantity,
              documentPrice(line.unitPrice, currency),
              totals.valid
                ? documentMoney(totals.amounts[index], currency)
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
        `Subtotal  ${totals.valid ? documentMoney(totals.subtotal, currency) : "[amount]"}`,
      ),
      para(
        `Tax (${content.fields.tax_rate || "0"}%)  ${totals.valid ? documentMoney(totals.tax, currency) : "[amount]"}`,
      ),
      new Paragraph({
        children: [
          text(
            `Total due  ${totals.valid ? documentMoney(totals.total, currency) : "[complete line items]"}`,
            32,
            true,
            primary,
          ),
        ],
        spacing: { before: 120, after: 300 },
      }),
    );
  }
  content.sections.forEach((section) => {
    children.push(
      new Paragraph({
        text: resolveDocumentText(section.title, content),
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: !!section.pageBreak,
        spacing: { before: 240, after: 150 },
      }),
    );
    resolveDocumentText(section.body, content)
      .split(/\n{2,}/)
      .forEach((line) => children.push(para(line)));
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
    if (link) children.push(para(`Pay online: ${link}`));
  }
  if (content.sources.length)
    children.push(
      new Paragraph({ text: "Sources", heading: HeadingLevel.HEADING_1 }),
      ...content.sources.map((source) =>
        para(
          `${source.label}${safeDocumentUrl(source.url) ? " · " + source.url : ""} · Added ${source.capturedAt.slice(0, 10)}`,
        ),
      ),
    );
  if (brand.address || brand.registration || brand.phone || brand.website)
    children.push(
      new Paragraph({
        text: "Agency details",
        heading: HeadingLevel.HEADING_1,
      }),
      para(
        [
          brand.legalName || brand.name,
          brand.address,
          brand.registration,
          brand.phone,
          brand.website,
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    );
  const contact = [brand.legalName || brand.name, brand.email]
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
          run: { font: "Georgia", size: 58, bold: false, color: primary },
          paragraph: { spacing: { after: 220 } },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          run: { size: 28, bold: true, color: primary },
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
            margin: { top: 1200, bottom: 1200, left: 1100, right: 1100 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  ...(logo
                    ? [
                        new ImageRun({
                          type: "png",
                          data: logo.bytes,
                          transformation: {
                            width: logo.width,
                            height: logo.height,
                          },
                        }),
                      ]
                    : []),
                  text(brand.name, 24, true, primary),
                ],
                spacing: { after: 180 },
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
