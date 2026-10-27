import {
  Document,
  Page,
  Text,
  View,
  Image,
  Link,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import {
  DOCUMENT_TEMPLATES,
  documentBrief,
  documentMoney,
  documentPrice,
  invoiceTotals,
  resolveDocumentText,
  safeDocumentUrl,
  type AgencyDocument,
} from "@/lib/agency-documents";
import {
  documentBriefColumns,
  documentCoverLead,
  documentTheme,
  isDocumentSigningBlock,
} from "@/lib/document-presentation";
// Self-hosted static fonts preserve extended Latin, Greek and Cyrillic names.
// This module is loaded only when the user chooses PDF export.
Font.register({
  family: "AgencyDocumentSans",
  fonts: [
    { src: "/fonts/agency-documents/NotoSans-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/agency-documents/NotoSans-Bold.ttf", fontWeight: 700 },
  ],
});
Font.register({
  family: "AgencyDocumentSerif",
  src: "/fonts/agency-documents/NotoSerif-Regular.ttf",
});
const keepWordWhole = (word: string) => [word];
const styles = StyleSheet.create({
  page: {
    paddingTop: 116,
    paddingBottom: 84,
    paddingHorizontal: 48,
    fontFamily: "AgencyDocumentSans",
    fontSize: 10.5,
    color: "#263740",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 84,
    paddingHorizontal: 48,
    paddingVertical: 23,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: { width: 84, height: 38, objectFit: "contain" },
  brand: {
    fontSize: 16,
    fontFamily: "AgencyDocumentSans",
    fontWeight: 700,
    maxWidth: 360,
  },
  category: {
    fontSize: 8,
    letterSpacing: 1.4,
    color: "#60717A",
    marginBottom: 10,
  },
  title: {
    fontFamily: "AgencyDocumentSerif",
    fontSize: 32,
    lineHeight: 1.12,
    marginBottom: 18,
  },
  heading: {
    fontFamily: "AgencyDocumentSans",
    fontWeight: 700,
    fontSize: 14,
    marginBottom: 6,
    marginTop: 14,
    lineHeight: 1.25,
  },
  // Keep fontSize beside lineHeight: this renderer resolves line spacing before
  // inheriting the Page's smaller font, otherwise it uses its 18pt default.
  body: { fontSize: 10.5, marginBottom: 8, lineHeight: 1.45 },
  reportBody: { fontSize: 10.5, marginBottom: 6, lineHeight: 1.4 },
  footer: {
    position: "absolute",
    bottom: 25,
    left: 48,
    right: 48,
    fontSize: 7.5,
    color: "#60717A",
    borderTopWidth: 0.5,
    borderTopColor: "#DCE3E5",
    paddingTop: 10,
    paddingRight: 60,
    height: 48,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#DCE3E5",
    paddingVertical: 6,
  },
  cell: { width: "21%", paddingRight: 8, fontSize: 9, textAlign: "right" },
  description: { width: "46%", textAlign: "left" },
  quantity: { width: "12%" },
  total: {
    fontSize: 22,
    fontFamily: "AgencyDocumentSans",
    fontWeight: 700,
    marginTop: 15,
    marginBottom: 20,
  },
  draft: { fontSize: 9, color: "#8A5B20", marginBottom: 12 },
  brief: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    marginBottom: 14,
    paddingTop: 14,
    borderTopWidth: 0.5,
    borderTopColor: "#DCE3E5",
  },
  briefItem: { width: "50%", paddingRight: 20, marginBottom: 12 },
  briefLabel: { fontSize: 8, color: "#60717A", marginBottom: 4 },
  briefValue: { fontSize: 10.5, lineHeight: 1.4 },
  pitchTitle: {
    fontFamily: "AgencyDocumentSerif",
    fontSize: 48,
    lineHeight: 1.1,
    marginTop: 12,
    marginBottom: 28,
    maxWidth: 630,
  },
  pitchNumber: {
    fontSize: 9,
    letterSpacing: 1.5,
    color: "#60717A",
    marginTop: 14,
    marginBottom: 12,
  },
  pitchHeading: {
    fontFamily: "AgencyDocumentSerif",
    fontSize: 34,
    lineHeight: 1.15,
    marginBottom: 22,
    maxWidth: 650,
  },
  pitchBody: { fontSize: 16, lineHeight: 1.5, marginBottom: 16, maxWidth: 590 },
  source: { fontSize: 8, color: "#60717A", marginBottom: 5, lineHeight: 1.4 },
});
export default function AgencyDocumentPdf({
  doc,
  logo,
}: {
  doc: AgencyDocument;
  logo?: string;
}) {
  const { content, kind } = doc,
    { brand } = content,
    totals = invoiceTotals(content),
    theme = documentTheme(brand),
    primary = theme.primary,
    brief = documentBrief(doc),
    isPitch = kind === "agency_pitch";
  const bodyStyle = isPitch
    ? styles.pitchBody
    : kind === "scouting_report"
      ? styles.reportBody
      : styles.body;
  const furniture = (
    <>
      <View
        fixed
        style={[
          styles.header,
          {
            backgroundColor: theme.surface,
            borderBottomWidth: 3,
            borderBottomColor: theme.accent,
          },
        ]}
      >
        <Text
          hyphenationCallback={keepWordWhole}
          style={[
            styles.brand,
            {
              color: primary,
              fontSize:
                brand.name.length > 90 ? 9 : brand.name.length > 55 ? 12 : 16,
            },
          ]}
        >
          {brand.name}
        </Text>
        {logo ? <Image style={styles.logo} src={logo} /> : null}
      </View>
      <View fixed style={styles.footer}>
        <Text style={{ fontSize: 7.5, lineHeight: 1.3 }}>
          {brand.legalName || brand.name}
        </Text>
        <Text style={{ fontSize: 7.5, lineHeight: 1.3 }}>
          {[brand.email, brand.phone, brand.website]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      <Text
        fixed
        style={{
          position: "absolute",
          bottom: 25,
          right: 48,
          fontSize: 7.5,
          color: "#60717A",
        }}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </>
  );
  const briefing = brief.length ? (
    <View
      style={[
        styles.brief,
        kind === "scouting_report"
          ? { marginTop: 0, paddingTop: 10, marginBottom: 6 }
          : {},
      ]}
    >
      {brief.map(({ label, value }) => (
        <View
          key={label}
          style={[
            styles.briefItem,
            kind === "scouting_report"
              ? {
                  width:
                    documentBriefColumns(kind, brief.length) === 3
                      ? "33.333%"
                      : "50%",
                  paddingRight: 12,
                  marginBottom: 4,
                }
              : isPitch
                ? { width: "33.333%" }
                : {},
          ]}
        >
          <Text style={styles.briefLabel} minPresenceAhead={22}>
            {label}
          </Text>
          <Text
            style={[styles.briefValue, { color: primary }]}
            hyphenationCallback={keepWordWhole}
          >
            {value}
          </Text>
        </View>
      ))}
    </View>
  ) : null;
  return (
    <Document title={doc.title} author={brand.name} creator={brand.name}>
      {isPitch ? (
        <Page
          size="A4"
          orientation="landscape"
          style={[styles.page, { paddingTop: 150 }]}
        >
          {furniture}
          <Text style={styles.category}>PLAYER PITCH</Text>
          <Text
            style={[styles.pitchTitle, { color: primary }]}
            hyphenationCallback={keepWordWhole}
          >
            {doc.title}
          </Text>
          {!content.reviewed ? (
            <Text style={styles.draft}>DRAFT FOR REVIEW</Text>
          ) : null}
          {documentCoverLead(doc) ? (
            <Text
              style={{
                fontSize: 14,
                lineHeight: 1.5,
                maxWidth: 600,
                marginTop: 12,
                color: "#52645e",
              }}
            >
              {documentCoverLead(doc)}
            </Text>
          ) : null}
          {briefing}
        </Page>
      ) : null}
      <Page
        size="A4"
        orientation={isPitch ? "landscape" : "portrait"}
        style={[
          styles.page,
          kind === "scouting_report" ? { paddingTop: 104 } : {},
        ]}
      >
        {furniture}
        {!isPitch ? (
          <>
            <Text style={styles.category}>
              {DOCUMENT_TEMPLATES[kind].label.toUpperCase()}
            </Text>
            <Text
              style={[
                styles.title,
                { color: primary },
                kind === "scouting_report"
                  ? { fontSize: 28, marginBottom: 14 }
                  : {},
              ]}
              hyphenationCallback={keepWordWhole}
            >
              {doc.title}
            </Text>
            {!content.reviewed ? (
              <Text style={styles.draft}>DRAFT FOR REVIEW</Text>
            ) : null}
            {briefing}
          </>
        ) : null}
        {kind === "invoice" ? (
          <View>
            <Text style={styles.body}>
              Invoice {content.fields.invoice_number || "[invoice number]"} ·
              Issued {content.fields.issue_date || "[date]"} · Due{" "}
              {content.fields.due_date || "[date]"}
            </Text>
            <Text style={styles.heading}>Bill to</Text>
            <Text style={styles.body}>
              {content.fields.recipient_name || "[recipient]"}
              {"\n"}
              {content.fields.recipient_address}
            </Text>
            <View>
              <View
                fixed
                style={[styles.row, { backgroundColor: theme.surface }]}
              >
                {["Description", "Quantity", "Unit price", "Amount"].map(
                  (label, index) => (
                    <Text
                      key={label}
                      style={[
                        styles.cell,
                        index === 0
                          ? styles.description
                          : index === 1
                            ? styles.quantity
                            : {},
                        { fontWeight: 700 },
                      ]}
                    >
                      {label}
                    </Text>
                  ),
                )}
              </View>
              {content.lines.map((line, index) => (
                <View key={line.id} style={styles.row} wrap={false}>
                  <Text style={[styles.cell, styles.description]}>
                    {line.description || "[service]"}
                  </Text>
                  <Text style={[styles.cell, styles.quantity]}>
                    {line.quantity}
                  </Text>
                  <Text style={styles.cell}>
                    {documentPrice(line.unitPrice, content)}
                  </Text>
                  <Text style={styles.cell}>
                    {totals.valid
                      ? documentMoney(totals.amounts[index], content)
                      : "[amount]"}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={styles.body}>
              Subtotal{" "}
              {totals.valid
                ? documentMoney(totals.subtotal, content)
                : "[amount]"}{" "}
              · Tax ({content.fields.tax_rate || "0"}%){" "}
              {totals.valid ? documentMoney(totals.tax, content) : "[amount]"}
            </Text>
            <Text style={[styles.total, { color: primary }]}>
              Total due{" "}
              {totals.valid
                ? documentMoney(totals.total, content)
                : "[complete line items]"}
            </Text>
          </View>
        ) : null}
        {content.sections.map((section, index) => {
          const title = resolveDocumentText(section.title, content);
          const body = resolveDocumentText(section.body, content);
          const paragraphs = body.split(/\n{2,}/);
          const keepLead =
            paragraphs[0].length < (isPitch ? 400 : 800) &&
            (!isPitch || title.length < 80);
          const heading = (
            <>
              {isPitch ? (
                <Text style={styles.pitchNumber}>
                  {String(index + 1).padStart(2, "0")} /{" "}
                  {String(content.sections.length).padStart(2, "0")}
                </Text>
              ) : null}
              <Text
                style={[
                  isPitch ? styles.pitchHeading : styles.heading,
                  kind === "scouting_report"
                    ? { marginTop: 8, marginBottom: 4, fontSize: 13 }
                    : {},
                  { color: primary },
                ]}
                hyphenationCallback={keepWordWhole}
                minPresenceAhead={isPitch ? 100 : 80}
              >
                {title}
              </Text>
            </>
          );
          const first = (
            <Text style={bodyStyle} orphans={3} widows={3}>
              {paragraphs[0]}
            </Text>
          );
          return (
            <View
              key={section.id}
              break={!!section.pageBreak && (!isPitch || index > 0)}
              wrap={!isDocumentSigningBlock(body)}
            >
              {keepLead ? (
                <View wrap={false}>
                  {heading}
                  {first}
                </View>
              ) : (
                <>
                  {heading}
                  {first}
                </>
              )}
              {paragraphs.slice(1).map((paragraph, i) => (
                <Text key={i} style={bodyStyle} orphans={3} widows={3}>
                  {paragraph}
                </Text>
              ))}
            </View>
          );
        })}
        {kind === "invoice" && brand.bankDetails ? (
          <View wrap={false}>
            <Text style={styles.heading}>Bank details</Text>
            <Text style={styles.body}>{brand.bankDetails}</Text>
          </View>
        ) : null}
        {kind === "invoice" && safeDocumentUrl(content.fields.payment_url) ? (
          <Link
            src={safeDocumentUrl(content.fields.payment_url)}
            style={{ fontSize: 11, color: primary }}
          >
            Pay online
          </Link>
        ) : null}
        {content.sources.length ? (
          <View
            wrap={
              !(
                content.sources.length <= 3 &&
                content.sources.reduce(
                  (sum, source) =>
                    sum + source.label.length + source.url.length,
                  0,
                ) < 1000
              )
            }
          >
            <Text
              style={[
                styles.heading,
                kind === "scouting_report"
                  ? { fontSize: 13, marginTop: 8, marginBottom: 4 }
                  : {},
              ]}
              minPresenceAhead={35}
            >
              Sources
            </Text>
            {content.sources.map((source, index) => (
              <Text key={index} style={styles.source}>
                {safeDocumentUrl(source.url) ? (
                  <Link
                    src={safeDocumentUrl(source.url)}
                    style={{ color: primary }}
                  >
                    {source.label}
                  </Link>
                ) : (
                  source.label
                )}{" "}
                · Added {source.capturedAt.slice(0, 10)}
                {safeDocumentUrl(source.url) ? `\n${source.url}` : ""}
              </Text>
            ))}
          </View>
        ) : null}
        {["player_contract", "mandate", "invoice"].includes(kind) &&
        (brand.address || brand.registration) ? (
          <View wrap={false}>
            <Text style={styles.heading} minPresenceAhead={35}>
              Agency details
            </Text>
            <Text style={styles.body}>
              {[
                brand.legalName || brand.name,
                brand.address,
                brand.registration,
              ]
                .filter(Boolean)
                .join("\n")}
            </Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
