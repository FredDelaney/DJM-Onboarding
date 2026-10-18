import {
  Document,
  Page,
  Text,
  View,
  Image,
  Link,
  StyleSheet,
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
import { readableBrandInk } from "@/lib/tenant-brand-style";
const styles = StyleSheet.create({
  page: {
    paddingTop: 116,
    paddingBottom: 76,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
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
  brand: { fontSize: 16, fontFamily: "Helvetica-Bold", maxWidth: 360 },
  category: {
    fontSize: 8,
    letterSpacing: 1.4,
    color: "#60717A",
    marginBottom: 10,
  },
  title: {
    fontFamily: "Times-Roman",
    fontSize: 32,
    lineHeight: 1.12,
    marginBottom: 18,
  },
  heading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 14,
    marginBottom: 6,
    marginTop: 14,
    lineHeight: 1.25,
  },
  // Keep fontSize beside lineHeight: this renderer resolves line spacing before
  // inheriting the Page's smaller font, otherwise it uses its 18pt default.
  body: { fontSize: 10.5, marginBottom: 8, lineHeight: 1.45 },
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
    height: 40,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#DCE3E5",
    paddingVertical: 10,
  },
  cell: { width: "20%", paddingRight: 8, fontSize: 9 },
  description: { width: "40%" },
  total: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
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
    fontFamily: "Times-Roman",
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
    fontFamily: "Times-Roman",
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
    currency = content.fields.currency || "EUR",
    primary = readableBrandInk(brand.primary),
    brief = documentBrief(doc),
    isPitch = kind === "agency_pitch";
  const furniture = (
    <>
      <View
        fixed
        style={[
          styles.header,
          {
            backgroundColor: "#F3F5F5",
            borderBottomWidth: 3,
            borderBottomColor: brand.accent,
          },
        ]}
      >
        <Text style={[styles.brand, { color: primary }]}>{brand.name}</Text>
        {logo ? <Image style={styles.logo} src={logo} /> : null}
      </View>
      <View fixed style={styles.footer}>
        <Text style={{ fontSize: 7.5, lineHeight: 1.3 }}>
          {[brand.legalName || brand.name, brand.email]
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
    <View style={styles.brief}>
      {brief.map(({ label, value }) => (
        <View
          key={label}
          style={[
            styles.briefItem,
            kind === "scouting_report"
              ? { width: "25%", paddingRight: 12 }
              : isPitch
                ? { width: "33.333%" }
                : {},
          ]}
          wrap={false}
        >
          <Text style={styles.briefLabel}>{label}</Text>
          <Text style={[styles.briefValue, { color: primary }]}>{value}</Text>
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
          <Text style={[styles.pitchTitle, { color: primary }]}>
            {doc.title}
          </Text>
          {!content.reviewed ? (
            <Text style={styles.draft}>DRAFT FOR REVIEW</Text>
          ) : null}
          {briefing}
        </Page>
      ) : null}
      <Page
        size="A4"
        orientation={isPitch ? "landscape" : "portrait"}
        style={styles.page}
      >
        {furniture}
        {!isPitch ? (
          <>
            <Text style={styles.category}>
              {DOCUMENT_TEMPLATES[kind].label.toUpperCase()}
            </Text>
            <Text style={[styles.title, { color: primary }]}>{doc.title}</Text>
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
            <View style={[styles.row, { backgroundColor: "#F3F5F5" }]}>
              {["Description", "Quantity", "Unit price", "Amount"].map(
                (label, index) => (
                  <Text
                    key={label}
                    style={[styles.cell, index === 0 ? styles.description : {}]}
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
                <Text style={styles.cell}>{line.quantity}</Text>
                <Text style={styles.cell}>
                  {documentPrice(line.unitPrice, currency)}
                </Text>
                <Text style={styles.cell}>
                  {totals.valid
                    ? documentMoney(totals.amounts[index], currency)
                    : "[amount]"}
                </Text>
              </View>
            ))}
            <Text style={styles.body}>
              Subtotal{" "}
              {totals.valid
                ? documentMoney(totals.subtotal, currency)
                : "[amount]"}{" "}
              · Tax ({content.fields.tax_rate || "0"}%){" "}
              {totals.valid ? documentMoney(totals.tax, currency) : "[amount]"}
            </Text>
            <Text style={[styles.total, { color: primary }]}>
              Total due{" "}
              {totals.valid
                ? documentMoney(totals.total, currency)
                : "[complete line items]"}
            </Text>
          </View>
        ) : null}
        {content.sections.map((section, index) => (
          <View
            key={section.id}
            break={!!section.pageBreak && (!isPitch || index > 0)}
          >
            {isPitch ? (
              <Text style={styles.pitchNumber}>
                {String(index + 1).padStart(2, "0")} /{" "}
                {String(content.sections.length).padStart(2, "0")}
              </Text>
            ) : null}
            <Text
              style={[
                isPitch ? styles.pitchHeading : styles.heading,
                kind === "scouting_report" ? { marginTop: 10 } : {},
                { color: primary },
              ]}
              minPresenceAhead={isPitch ? 100 : 45}
            >
              {resolveDocumentText(section.title, content)}
            </Text>
            <Text
              style={isPitch ? styles.pitchBody : styles.body}
              orphans={3}
              widows={3}
            >
              {resolveDocumentText(section.body, content)}
            </Text>
          </View>
        ))}
        {kind === "invoice" && brand.bankDetails ? (
          <View>
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
          <View>
            <Text style={styles.heading} minPresenceAhead={35}>
              Sources
            </Text>
            {content.sources.map((source, index) => (
              <Text key={index} style={styles.source}>
                {source.label} · Added {source.capturedAt.slice(0, 10)}
                {safeDocumentUrl(source.url) ? `\n${source.url}` : ""}
              </Text>
            ))}
          </View>
        ) : null}
        {brand.address || brand.registration || brand.phone || brand.website ? (
          <View>
            <Text style={styles.heading} minPresenceAhead={35}>
              Agency details
            </Text>
            <Text style={styles.body}>
              {[
                brand.legalName || brand.name,
                brand.address,
                brand.registration,
                brand.phone,
                brand.website,
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
