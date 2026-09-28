// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Provider = "google" | "microsoft";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-djm-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (
  body: unknown,
  status = 200,
) =>
  new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...cors,
        "Content-Type":
          "application/json",
      },
    },
  );

const defaultKey = (
  legacyName: string,
  modernName: string,
) => {
  const legacy =
    Deno.env.get(
      legacyName,
    );

  if (legacy) return legacy;

  const modern =
    Deno.env.get(
      modernName,
    );

  if (!modern) return "";

  try {
    const parsed =
      JSON.parse(modern);

    return String(
      parsed?.default || "",
    );
  } catch {
    return "";
  }
};

const providerConfig = (
  provider: Provider,
) => {
  if (provider === "google") {
    return {
      clientId:
        Deno.env.get(
          "GOOGLE_OAUTH_CLIENT_ID",
        ) || "",
      clientSecret:
        Deno.env.get(
          "GOOGLE_OAUTH_CLIENT_SECRET",
        ) || "",
    };
  }

  return {
    clientId:
      Deno.env.get(
        "MICROSOFT_OAUTH_CLIENT_ID",
      ) || "",
    clientSecret:
      Deno.env.get(
        "MICROSOFT_OAUTH_CLIENT_SECRET",
      ) || "",
  };
};

const inBatches = async (
  values: any[],
  size: number,
  worker: (
    value: any,
  ) => Promise<any>,
) => {
  const output: any[] = [];

  for (
    let index = 0;
    index < values.length;
    index += size
  ) {
    output.push(
      ...(
        await Promise.all(
          values
            .slice(
              index,
              index + size,
            )
            .map(worker),
        )
      ),
    );
  }

  return output;
};

const fetchJson = async (
  url: string,
  accessToken: string,
  headers: Record<
    string,
    string
  > = {},
) => {
  const response =
    await fetch(
      url,
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          ...headers,
        },
      },
    );

  let payload: any = null;

  try {
    payload =
      await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error: any =
      new Error(
        payload?.error
          ?.message ||
          payload?.error_description ||
          payload?.message ||
          `Provider request failed (${response.status})`,
      );

    error.status =
      response.status;

    throw error;
  }

  return payload;
};

const refreshAccessToken =
  async (
    provider: Provider,
    connection: any,
  ) => {
    const config =
      providerConfig(
        provider,
      );

    if (
      !config.clientId ||
      !config.clientSecret
    ) {
      throw new Error(
        `${provider === "google" ? "Google" : "Microsoft"} OAuth credentials are not configured.`,
      );
    }

    const body =
      new URLSearchParams({
        client_id:
          config.clientId,
        client_secret:
          config.clientSecret,
        refresh_token:
          String(
            connection
              ?.refresh_token ||
              "",
          ),
        grant_type:
          "refresh_token",
      });

    let url = "";

    if (provider === "google") {
      url =
        "https://oauth2.googleapis.com/token";
    } else {
      url =
        "https://login.microsoftonline.com/common/oauth2/v2.0/token";

      const scopes =
        Array.isArray(
          connection?.scopes,
        )
          ? connection.scopes
              .map(String)
              .filter(Boolean)
          : [];

      if (
        scopes.length > 0
      ) {
        body.set(
          "scope",
          scopes.join(" "),
        );
      }
    }

    const response =
      await fetch(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },
          body,
        },
      );

    const payload =
      await response.json();

    if (
      !response.ok ||
      !payload?.access_token
    ) {
      throw new Error(
        payload?.error_description ||
        payload?.error ||
        "Provider token refresh failed",
      );
    }

    return {
      accessToken:
        String(
          payload.access_token,
        ),
      refreshToken:
        payload.refresh_token
          ? String(
              payload.refresh_token,
            )
          : null,
    };
  };

const uniqueEmails = (
  values: Array<
    string | null | undefined
  >,
  ownEmail?: string | null,
) => {
  const own =
    String(
      ownEmail || "",
    )
      .trim()
      .toLowerCase();

  return Array.from(
    new Set(
      values
        .map(
          (value) =>
            String(
              value || "",
            )
              .trim()
              .toLowerCase(),
        )
        .filter(
          (value) =>
            value &&
            value !== own,
        ),
    ),
  );
};

const googleMeetingUrl = (
  event: any,
) => {
  if (event?.hangoutLink) {
    return String(
      event.hangoutLink,
    );
  }

  const entry =
    event?.conferenceData
      ?.entryPoints
      ?.find(
        (item: any) =>
          item?.entryPointType ===
            "video" &&
          item?.uri,
      );

  return entry?.uri
    ? String(entry.uri)
    : null;
};

const fetchGoogleCalendar =
  async (
    accessToken: string,
    ownEmail: string | null,
    windowStart: string,
    windowEnd: string,
  ) => {
    const output: any[] = [];
    let pageToken = "";

    for (
      let page = 0;
      page < 20;
      page += 1
    ) {
      const url =
        new URL(
          "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        );

      url.searchParams.set(
        "singleEvents",
        "true",
      );
      url.searchParams.set(
        "showDeleted",
        "true",
      );
      url.searchParams.set(
        "timeMin",
        windowStart,
      );
      url.searchParams.set(
        "timeMax",
        windowEnd,
      );
      url.searchParams.set(
        "maxResults",
        "2500",
      );

      if (pageToken) {
        url.searchParams.set(
          "pageToken",
          pageToken,
        );
      }

      const payload =
        await fetchJson(
          url.toString(),
          accessToken,
        );

      for (
        const event of
          Array.isArray(
            payload?.items,
          )
            ? payload.items
            : []
      ) {
        const externalId =
          String(
            event?.id || "",
          ).trim();

        if (!externalId) {
          continue;
        }

        if (
          event?.status ===
          "cancelled"
        ) {
          output.push({
            external_event_id:
              externalId,
            status:
              "cancelled",
          });

          continue;
        }

        if (
          !event?.start
            ?.dateTime ||
          !event?.end
            ?.dateTime
        ) {
          continue;
        }

        const emails =
          uniqueEmails(
            [
              ...(Array.isArray(
                event?.attendees,
              )
                ? event.attendees
                    .filter(
                      (
                        attendee: any,
                      ) =>
                        !attendee
                          ?.self,
                    )
                    .map(
                      (
                        attendee: any,
                      ) =>
                        attendee
                          ?.email,
                    )
                : []),
              event?.organizer
                ?.email,
            ],
            ownEmail,
          );

        if (
          emails.length === 0
        ) {
          continue;
        }

        output.push({
          external_event_id:
            externalId,
          title:
            String(
              event?.summary ||
                "Meeting",
            ),
          starts_at:
            String(
              event.start
                .dateTime,
            ),
          ends_at:
            String(
              event.end
                .dateTime,
            ),
          timezone:
            event?.start
              ?.timeZone ||
            event?.end
              ?.timeZone ||
            null,
          meeting_url:
            googleMeetingUrl(
              event,
            ),
          invitee_email:
            emails[0],
          status:
            "scheduled",
        });
      }

      pageToken =
        String(
          payload
            ?.nextPageToken ||
            "",
        );

      if (!pageToken) {
        break;
      }
    }

    return output;
  };

const googleContact =
  (person: any) => {
    const externalId =
      String(
        person?.resourceName ||
          "",
      ).trim();

    if (!externalId) {
      return null;
    }

    const source =
      Array.isArray(
        person?.metadata
          ?.sources,
      )
        ? person.metadata
            .sources[0]
        : null;

    const name =
      Array.isArray(
        person?.names,
      )
        ? person.names[0]
        : null;

    const email =
      Array.isArray(
        person
          ?.emailAddresses,
      )
        ? person
            .emailAddresses[0]
            ?.value
        : null;

    const phone =
      Array.isArray(
        person
          ?.phoneNumbers,
      )
        ? person
            .phoneNumbers[0]
            ?.value
        : null;

    const organisation =
      Array.isArray(
        person
          ?.organizations,
      )
        ? person
            .organizations[0]
        : null;

    return {
      external_contact_id:
        externalId,
      display_name:
        name?.displayName ||
        [
          name?.givenName,
          name?.familyName,
        ]
          .filter(Boolean)
          .join(" ") ||
        null,
      email:
        email || null,
      phone:
        phone || null,
      organisation_name:
        organisation?.name ||
        null,
      role_title:
        organisation?.title ||
        null,
      deleted:
        Boolean(
          person?.metadata
            ?.deleted,
        ),
      provider_updated_at:
        source?.updateTime ||
        null,
      metadata: {
        resource_name:
          externalId,
      },
    };
  };

const fetchGoogleContacts =
  async (
    accessToken: string,
    syncToken:
      | string
      | null,
  ): Promise<{
    contacts: any[];
    fullSnapshot: boolean;
    syncToken: string | null;
  }> => {
    const personFields =
      "names,emailAddresses,phoneNumbers,organizations,metadata";

    const run =
      async (
        token:
          | string
          | null,
      ) => {
        const contacts: any[] =
          [];

        let pageToken = "";
        let nextSyncToken =
          token;
        let tokenExpired =
          false;

        for (
          let page = 0;
          page < 30;
          page += 1
        ) {
          const url =
            new URL(
              "https://people.googleapis.com/v1/people/me/connections",
            );

          url.searchParams.set(
            "personFields",
            personFields,
          );
          url.searchParams.set(
            "pageSize",
            "500",
          );

          if (token) {
            url.searchParams.set(
              "syncToken",
              token,
            );
          } else {
            url.searchParams.set(
              "requestSyncToken",
              "true",
            );
          }

          if (pageToken) {
            url.searchParams.set(
              "pageToken",
              pageToken,
            );
          }

          try {
            const payload =
              await fetchJson(
                url.toString(),
                accessToken,
              );

            for (
              const person of
                Array.isArray(
                  payload?.connections,
                )
                  ? payload.connections
                  : []
            ) {
              const mapped =
                googleContact(
                  person,
                );

              if (mapped) {
                contacts.push(
                  mapped,
                );
              }
            }

            if (
              payload
                ?.nextSyncToken
            ) {
              nextSyncToken =
                String(
                  payload
                    .nextSyncToken,
                );
            }

            pageToken =
              String(
                payload
                  ?.nextPageToken ||
                  "",
              );

            if (!pageToken) {
              break;
            }
          } catch (error) {
            if (
              token &&
              (error as any)
                ?.status === 410
            ) {
              tokenExpired =
                true;
              break;
            }

            throw error;
          }
        }

        return {
          contacts,
          nextSyncToken,
          tokenExpired,
        };
      };

    const incremental =
      await run(
        syncToken,
      );

    if (
      incremental
        .tokenExpired
    ) {
      const full =
        await run(null);

      return {
        contacts:
          full.contacts,
        fullSnapshot: true,
        syncToken:
          full.nextSyncToken ||
          null,
      };
    }

    return {
      contacts:
        incremental.contacts,
      fullSnapshot:
        !syncToken,
      syncToken:
        incremental
          .nextSyncToken ||
        syncToken ||
        null,
    };
  };

const microsoftUtc = (
  dateTime: unknown,
) => {
  const value =
    String(
      dateTime || "",
    ).trim();

  if (!value) return null;

  if (
    /(?:Z|[+-]\d\d:\d\d)$/i.test(
      value,
    )
  ) {
    return value;
  }

  return `${value}Z`;
};

const fetchMicrosoftCalendar =
  async (
    accessToken: string,
    ownEmail: string | null,
    windowStart: string,
    windowEnd: string,
  ) => {
    const output: any[] = [];

    let url: URL | null =
      new URL(
        "https://graph.microsoft.com/v1.0/me/calendarView",
      );

    url.searchParams.set(
      "startDateTime",
      windowStart,
    );
    url.searchParams.set(
      "endDateTime",
      windowEnd,
    );
    url.searchParams.set(
      "$top",
      "100",
    );

    for (
      let page = 0;
      page < 30 &&
      url;
      page += 1
    ) {
      const payload =
        await fetchJson(
          url.toString(),
          accessToken,
          {
            Prefer:
              'outlook.timezone="UTC", odata.maxpagesize=100',
          },
        );

      for (
        const event of
          Array.isArray(
            payload?.value,
          )
            ? payload.value
            : []
      ) {
        const externalId =
          String(
            event?.id || "",
          ).trim();

        if (!externalId) {
          continue;
        }

        if (
          event?.isCancelled
        ) {
          output.push({
            external_event_id:
              externalId,
            status:
              "cancelled",
          });

          continue;
        }

        if (event?.isAllDay) {
          continue;
        }

        const startsAt =
          microsoftUtc(
            event?.start
              ?.dateTime,
          );

        const endsAt =
          microsoftUtc(
            event?.end
              ?.dateTime,
          );

        if (
          !startsAt ||
          !endsAt
        ) {
          continue;
        }

        const emails =
          uniqueEmails(
            [
              ...(Array.isArray(
                event?.attendees,
              )
                ? event.attendees.map(
                    (
                      attendee: any,
                    ) =>
                      attendee
                        ?.emailAddress
                        ?.address,
                  )
                : []),
              event?.organizer
                ?.emailAddress
                ?.address,
            ],
            ownEmail,
          );

        if (
          emails.length === 0
        ) {
          continue;
        }

        output.push({
          external_event_id:
            externalId,
          title:
            String(
              event?.subject ||
                "Meeting",
            ),
          starts_at:
            startsAt,
          ends_at:
            endsAt,
          timezone:
            "UTC",
          meeting_url:
            event?.onlineMeeting
              ?.joinUrl ||
            event?.webLink ||
            null,
          invitee_email:
            emails[0],
          status:
            "scheduled",
        });
      }

      const next =
        payload?.[
          "@odata.nextLink"
        ];

      url =
        next
          ? new URL(
              String(next),
            )
          : null;
    }

    return output;
  };

const microsoftContact =
  (contact: any) => {
    const externalId =
      String(
        contact?.id || "",
      ).trim();

    if (!externalId) {
      return null;
    }

    const email =
      Array.isArray(
        contact
          ?.emailAddresses,
      )
        ? contact
            .emailAddresses[0]
            ?.address
        : null;

    const phone =
      contact?.mobilePhone ||
      (
        Array.isArray(
          contact
            ?.businessPhones,
        )
          ? contact
              .businessPhones[0]
          : null
      );

    return {
      external_contact_id:
        externalId,
      display_name:
        contact?.displayName ||
        [
          contact?.givenName,
          contact?.surname,
        ]
          .filter(Boolean)
          .join(" ") ||
        null,
      email:
        email || null,
      phone:
        phone || null,
      organisation_name:
        contact?.companyName ||
        null,
      role_title:
        contact?.jobTitle ||
        null,
      deleted: false,
      provider_updated_at:
        contact
          ?.lastModifiedDateTime ||
        null,
      metadata: {
        external_contact_id:
          externalId,
      },
    };
  };

const fetchMicrosoftContacts =
  async (
    accessToken: string,
  ) => {
    const contacts: any[] =
      [];

    let url: URL | null =
      new URL(
        "https://graph.microsoft.com/v1.0/me/contacts",
      );

    url.searchParams.set(
      "$top",
      "100",
    );

    url.searchParams.set(
      "$select",
      [
        "id",
        "displayName",
        "givenName",
        "surname",
        "emailAddresses",
        "businessPhones",
        "mobilePhone",
        "companyName",
        "jobTitle",
        "lastModifiedDateTime",
      ].join(","),
    );

    for (
      let page = 0;
      page < 50 &&
      url;
      page += 1
    ) {
      const payload =
        await fetchJson(
          url.toString(),
          accessToken,
        );

      for (
        const contact of
          Array.isArray(
            payload?.value,
          )
            ? payload.value
            : []
      ) {
        const mapped =
          microsoftContact(
            contact,
          );

        if (mapped) {
          contacts.push(
            mapped,
          );
        }
      }

      const next =
        payload?.[
          "@odata.nextLink"
        ];

      url =
        next
          ? new URL(
              String(next),
            )
          : null;
    }

    return {
      contacts,
      fullSnapshot: true,
    };
  };

const normaliseEmail = (
  value: unknown,
) =>
  String(value || "")
    .trim()
    .toLowerCase();

const emailAddressesFrom = (
  value: unknown,
) =>
  Array.from(
    new Set(
      (
        String(value || "")
          .match(
            /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
          ) || []
      ).map(
        (email) =>
          normaliseEmail(
            email,
          ),
      ),
    ),
  );

const knownEmailSet = (
  contacts: any[],
) =>
  new Set(
    contacts
      .map(
        (contact) =>
          normaliseEmail(
            contact?.email,
          ),
      )
      .filter(Boolean),
  );

const singleKnownEmail = (
  candidates: string[],
  known: Set<string>,
  ownEmail: string,
) => {
  const own =
    normaliseEmail(
      ownEmail,
    );

  const matches =
    Array.from(
      new Set(
        candidates
          .map(normaliseEmail)
          .filter(
            (email) =>
              email &&
              email !== own &&
              known.has(
                email,
              ),
          ),
      ),
    );

  return matches.length === 1
    ? matches[0]
    : null;
};

const decodeBase64Url = (
  value: unknown,
) => {
  const input =
    String(
      value || "",
    ).trim();

  if (!input) return "";

  try {
    const normalised =
      input
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const padded =
      normalised.padEnd(
        Math.ceil(
          normalised.length /
            4,
        ) * 4,
        "=",
      );

    const binary =
      atob(padded);

    const bytes =
      Uint8Array.from(
        binary,
        (character) =>
          character.charCodeAt(
            0,
          ),
      );

    return new TextDecoder()
      .decode(bytes);
  } catch {
    return "";
  }
};

const stripHtml = (
  value: unknown,
) =>
  String(value || "")
    .replace(
      /<script[\s\S]*?<\/script>/gi,
      " ",
    )
    .replace(
      /<style[\s\S]*?<\/style>/gi,
      " ",
    )
    .replace(
      /<br\s*\/?>/gi,
      "\n",
    )
    .replace(
      /<\/p>/gi,
      "\n",
    )
    .replace(
      /<[^>]+>/g,
      " ",
    )
    .replace(
      /&nbsp;/gi,
      " ",
    )
    .replace(
      /&amp;/gi,
      "&",
    )
    .replace(
      /&lt;/gi,
      "<",
    )
    .replace(
      /&gt;/gi,
      ">",
    )
    .replace(
      /&quot;/gi,
      '"',
    )
    .replace(
      /&#39;/gi,
      "'",
    );

const freshEmailBody = (
  value: unknown,
) => {
  let text =
    String(
      value || "",
    )
      .replace(
        /\r\n/g,
        "\n",
      )
      .trim();

  if (!text) return "";

  const cutPatterns = [
    /\nOn .{1,300}wrote:\s*\n/i,
    /\n-{2,}\s*Original Message\s*-{2,}/i,
    /\nFrom:\s*.+\nSent:\s*.+/i,
  ];

  let cutAt =
    text.length;

  for (
    const pattern of
      cutPatterns
  ) {
    const match =
      pattern.exec(
        text,
      );

    if (
      match &&
      typeof match.index ===
        "number"
    ) {
      cutAt =
        Math.min(
          cutAt,
          match.index,
        );
    }
  }

  text =
    text.slice(
      0,
      cutAt,
    );

  text =
    text
      .split("\n")
      .filter(
        (line) =>
          !line
            .trim()
            .startsWith(
              ">",
            ),
      )
      .join("\n")
      .replace(
        /\n{3,}/g,
        "\n\n",
      )
      .trim();

  return text.slice(
    0,
    12000,
  );
};

const gmailHeader = (
  message: any,
  name: string,
) => {
  const headers =
    Array.isArray(
      message?.payload
        ?.headers,
    )
      ? message
          .payload
          .headers
      : [];

  return String(
    headers.find(
      (header: any) =>
        String(
          header?.name ||
            "",
        ).toLowerCase() ===
        name.toLowerCase(),
    )?.value || "",
  );
};

const gmailBody = (
  message: any,
) => {
  const plain: string[] =
    [];

  const html: string[] =
    [];

  const visit = (
    part: any,
  ) => {
    const mimeType =
      String(
        part?.mimeType ||
          "",
      ).toLowerCase();

    const data =
      part?.body?.data;

    if (data) {
      const decoded =
        decodeBase64Url(
          data,
        );

      if (
        mimeType ===
        "text/plain"
      ) {
        plain.push(
          decoded,
        );
      } else if (
        mimeType ===
        "text/html"
      ) {
        html.push(
          decoded,
        );
      }
    }

    for (
      const child of
        Array.isArray(
          part?.parts,
        )
          ? part.parts
          : []
    ) {
      visit(child);
    }
  };

  visit(
    message?.payload,
  );

  const text =
    plain.length
      ? plain.join(
          "\n\n",
        )
      : stripHtml(
          html.join(
            "\n\n",
          ),
        );

  return freshEmailBody(
    text,
  );
};

const fetchGoogleEmails =
  async (
    accessToken: string,
    ownEmail: string,
    contacts: any[],
  ) => {
    const output: any[] =
      [];

    const known =
      knownEmailSet(
        contacts,
      );

    const sources = [
      {
        label:
          "INBOX",
        direction:
          "inbound",
      },
      {
        label:
          "SENT",
        direction:
          "outbound",
      },
    ];

    for (
      const source of
        sources
    ) {
      const url =
        new URL(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages",
        );

      url.searchParams.set(
        "labelIds",
        source.label,
      );

      url.searchParams.set(
        "q",
        "newer_than:7d -in:drafts",
      );

      url.searchParams.set(
        "maxResults",
        "100",
      );

      const listing =
        await fetchJson(
          url.toString(),
          accessToken,
        );

      const stubs =
        Array.isArray(
          listing?.messages,
        )
          ? listing
              .messages
              .slice(
                0,
                100,
              )
          : [];

            const messages =
        await inBatches(
          stubs,
          10,
          async (
            stub: any,
          ) => {
            const messageUrl =
              new URL(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(String(stub?.id || ""))}`,
              );

            messageUrl.searchParams.set(
              "format",
              "metadata",
            );

            for (
              const header of [
                "From",
                "To",
                "Cc",
                "Bcc",
                "Subject",
              ]
            ) {
              messageUrl.searchParams.append(
                "metadataHeaders",
                header,
              );
            }

            return await fetchJson(
              messageUrl.toString(),
              accessToken,
            );
          },
        );

      for (
        const message of
          messages
      ) {
        const externalId =
          String(
            message?.id ||
              "",
          ).trim();

        if (!externalId) {
          continue;
        }

        const candidateEmails =
          source.direction ===
          "inbound"
            ? emailAddressesFrom(
                gmailHeader(
                  message,
                  "From",
                ),
              )
            : [
                ...emailAddressesFrom(
                  gmailHeader(
                    message,
                    "To",
                  ),
                ),
                ...emailAddressesFrom(
                  gmailHeader(
                    message,
                    "Cc",
                  ),
                ),
                ...emailAddressesFrom(
                  gmailHeader(
                    message,
                    "Bcc",
                  ),
                ),
              ];

        const contactEmail =
          singleKnownEmail(
            candidateEmails,
            known,
            ownEmail,
          );

        if (
          !contactEmail
        ) {
          continue;
        }

                const fullMessage =
          await fetchJson(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(externalId)}?format=full`,
            accessToken,
          );

        const body =
          gmailBody(
            fullMessage,
          );

        if (!body) {
          continue;
        }

        const internalDate =
          Number(
            message
              ?.internalDate ||
              0,
          );

        const occurredAt =
          internalDate > 0
            ? new Date(
                internalDate,
              ).toISOString()
            : new Date()
                .toISOString();

        output.push({
          external_message_id:
            externalId,

          contact_email:
            contactEmail,

          direction:
            source.direction,

          subject:
            gmailHeader(
              message,
              "Subject",
            ) || null,

          body,

          occurred_at:
            occurredAt,
        });
      }
    }

    return Array.from(
      new Map(
        output.map(
          (email) => [
            email.external_message_id,
            email,
          ],
        ),
      ).values(),
    );
  };

const microsoftRecipients =
  (values: any) =>
    (
      Array.isArray(
        values,
      )
        ? values
        : []
    ).flatMap(
      (recipient: any) =>
        emailAddressesFrom(
          recipient
            ?.emailAddress
            ?.address,
        ),
    );

const fetchMicrosoftEmails =
  async (
    accessToken: string,
    ownEmail: string,
    contacts: any[],
  ) => {
    const output: any[] =
      [];

    const known =
      knownEmailSet(
        contacts,
      );

    const cutoff =
      Date.now() -
      7 *
        24 *
        60 *
        60 *
        1000;

    const sources = [
      {
        folder:
          "inbox",
        direction:
          "inbound",
        dateField:
          "receivedDateTime",
      },
      {
        folder:
          "sentitems",
        direction:
          "outbound",
        dateField:
          "sentDateTime",
      },
    ];

    for (
      const source of
        sources
    ) {
      const url =
        new URL(
          `https://graph.microsoft.com/v1.0/me/mailFolders/${source.folder}/messages`,
        );

      url.searchParams.set(
        "$top",
        "100",
      );

      url.searchParams.set(
        "$select",
        [
          "id",
          "subject",
          "from",
          "toRecipients",
          "ccRecipients",
          "bccRecipients",
          "receivedDateTime",
          "sentDateTime",
          "isDraft",
        ].join(","),
      );

      url.searchParams.set(
        "$orderby",
        `${source.dateField} desc`,
      );

      const payload =
        await fetchJson(
          url.toString(),
          accessToken,
          {
            Prefer:
              'outlook.body-content-type="text"',
          },
        );

      for (
        const message of
          Array.isArray(
            payload?.value,
          )
            ? payload.value
            : []
      ) {
        if (
          message?.isDraft
        ) {
          continue;
        }

        const externalId =
          String(
            message?.id ||
              "",
          ).trim();

        if (!externalId) {
          continue;
        }

        const rawOccurredAt =
          String(
            message?.[
              source
                .dateField
            ] ||
              message
                ?.receivedDateTime ||
              message
                ?.sentDateTime ||
              "",
          );

        const occurredMs =
          Date.parse(
            rawOccurredAt,
          );

        if (
          !Number.isFinite(
            occurredMs,
          ) ||
          occurredMs <
            cutoff
        ) {
          continue;
        }

        const candidateEmails =
          source.direction ===
          "inbound"
            ? emailAddressesFrom(
                message?.from
                  ?.emailAddress
                  ?.address,
              )
            : [
                ...microsoftRecipients(
                  message
                    ?.toRecipients,
                ),
                ...microsoftRecipients(
                  message
                    ?.ccRecipients,
                ),
                ...microsoftRecipients(
                  message
                    ?.bccRecipients,
                ),
              ];

        const contactEmail =
          singleKnownEmail(
            candidateEmails,
            known,
            ownEmail,
          );

        if (
          !contactEmail
        ) {
          continue;
        }

                const fullMessage =
          await fetchJson(
            `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(externalId)}?$select=body`,
            accessToken,
            {
              Prefer:
                'outlook.body-content-type="text"',
            },
          );

        const body =
          freshEmailBody(
            fullMessage?.body
              ?.content,
          );

        if (!body) {
          continue;
        }

        output.push({
          external_message_id:
            externalId,

          contact_email:
            contactEmail,

          direction:
            source.direction,

          subject:
            String(
              message
                ?.subject ||
                "",
            ).trim() ||
            null,

          body,

          occurred_at:
            new Date(
              occurredMs,
            ).toISOString(),
        });
      }
    }

    return Array.from(
      new Map(
        output.map(
          (email) => [
            email.external_message_id,
            email,
          ],
        ),
      ).values(),
    );
  };

const kickCaptures =
  async (
    admin: any,
    supabaseUrl: string,
    captureIds: string[],
  ) => {
    if (
      !captureIds.length
    ) {
      return;
    }

    const {
      data: secret,
      error,
    } =
      await admin.rpc(
        "get_push_scheduler_secret",
      );

    if (
      error ||
      !secret
    ) {
      console.error(
        JSON.stringify({
          operation:
            "redream_provider_email_worker_secret",
          status:
            "unavailable",
        }),
      );

      return;
    }

    await Promise.allSettled(
      captureIds.map(
        (
          captureId,
        ) =>
          fetch(
            `${supabaseUrl.replace(/\/$/, "")}/functions/v1/redream-ai-process`,
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",

                "x-djm-cron":
                  String(
                    secret,
                  ),

                "x-region":
                  "eu-west-1",
              },

              body:
                JSON.stringify({
                  capture_id:
                    captureId,

                  mode:
                    "process",
                }),
            },
          ),
      ),
    );
  };

Deno.serve(
  async (request: Request) => {
    if (
      request.method ===
      "OPTIONS"
    ) {
      return new Response(
        "ok",
        {
          headers: cors,
        },
      );
    }

    if (
      request.method !==
      "POST"
    ) {
      return json(
        {
          ok: false,
          error:
            "Method not allowed",
        },
        405,
      );
    }

    const supabaseUrl =
      Deno.env.get(
        "SUPABASE_URL",
      ) || "";

    const serviceKey =
      defaultKey(
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_SECRET_KEYS",
      );

    const publicKey =
      defaultKey(
        "SUPABASE_ANON_KEY",
        "SUPABASE_PUBLISHABLE_KEYS",
      );

    if (
      !supabaseUrl ||
      !serviceKey ||
      !publicKey
    ) {
      return json(
        {
          ok: false,
          error:
            "Server configuration is incomplete",
        },
        503,
      );
    }

    const admin =
      createClient(
        supabaseUrl,
        serviceKey,
        {
          auth: {
            persistSession:
              false,
            autoRefreshToken:
              false,
          },
        },
      );

    let body: any = {};

    try {
      body =
        await request.json();
    } catch {
      body = {};
    }

    const syncOne =
      async (
        target: {
          tenant_id: string;
          user_id: string;
          provider: Provider;
        },
      ) => {
        const provider =
          target.provider;

        const startedAt =
          new Date();

        const windowStart =
          new Date(
            startedAt.getTime() -
              30 *
                24 *
                60 *
                60 *
                1000,
          );

        const windowEnd =
          new Date(
            startedAt.getTime() +
              180 *
                24 *
                60 *
                60 *
                1000,
          );

        try {
          const {
            data:
              connection,
            error:
              contextError,
          } =
            await admin.rpc(
              "platform_server_provider_sync_secret",
              {
                p_tenant_id:
                  target.tenant_id,
                p_user_id:
                  target.user_id,
                p_provider:
                  provider,
              },
            );

          if (
            contextError ||
            !connection
          ) {
            throw (
              contextError ||
              new Error(
                "Provider connection context is unavailable",
              )
            );
          }

          const capabilities =
            Array.isArray(
              connection
                ?.capabilities,
            )
              ? connection.capabilities.map(
                  String,
                )
              : [];

          const refreshed =
            await refreshAccessToken(
              provider,
              connection,
            );

          let meetings: any[] =
            [];

          if (
            capabilities.includes(
              "calendar",
            )
          ) {
            meetings =
              provider ===
              "google"
                ? await fetchGoogleCalendar(
                    refreshed
                      .accessToken,
                    connection
                      ?.email ||
                      null,
                    windowStart.toISOString(),
                    windowEnd.toISOString(),
                  )
                : await fetchMicrosoftCalendar(
                    refreshed
                      .accessToken,
                    connection
                      ?.email ||
                      null,
                    windowStart.toISOString(),
                    windowEnd.toISOString(),
                  );
          }

          let contacts: any[] =
            [];
          let contactsFull =
            false;
          let syncState: any =
            {};

          if (
            capabilities.includes(
              "contacts",
            )
          ) {
            if (
              provider ===
              "google"
            ) {
              const previousToken =
                connection
                  ?.metadata
                  ?.google_contacts_sync_token
                  ? String(
                      connection
                        .metadata
                        .google_contacts_sync_token,
                    )
                  : null;

              const google =
                await fetchGoogleContacts(
                  refreshed
                    .accessToken,
                  previousToken,
                );

              contacts =
                google.contacts;

              contactsFull =
                google.fullSnapshot;

              syncState = {
                google_contacts_sync_token:
                  google
                    .syncToken,
              };
            } else {
              const microsoft =
                await fetchMicrosoftContacts(
                  refreshed
                    .accessToken,
                );

              contacts =
                microsoft.contacts;

              contactsFull =
                microsoft
                  .fullSnapshot;
            }
          }

          let emails: any[] =
            [];

          if (
            capabilities.includes(
              "email",
            )
          ) {
            const {
              data:
                emailContext,
              error:
                emailContextError,
            } =
              await admin.rpc(
                "platform_server_provider_email_contacts",
                {
                  p_tenant_id:
                    target.tenant_id,

                  p_user_id:
                    target.user_id,

                  p_provider:
                    provider,
                },
              );

            if (
              emailContextError ||
              !emailContext
            ) {
              throw (
                emailContextError ||
                new Error(
                  "Email context is unavailable",
                )
              );
            }

            const emailContacts =
              Array.isArray(
                emailContext
                  ?.contacts,
              )
                ? emailContext
                    .contacts
                : [];

            const ownEmail =
              String(
                emailContext
                  ?.own_email ||
                  connection
                    ?.email ||
                  "",
              );

            emails =
              provider ===
              "google"
                ? await fetchGoogleEmails(
                    refreshed
                      .accessToken,
                    ownEmail,
                    emailContacts,
                  )
                : await fetchMicrosoftEmails(
                    refreshed
                      .accessToken,
                    ownEmail,
                    emailContacts,
                  );
          }
          
          const hasCalendar =
            capabilities.includes(
              "calendar",
            );

          const {
            data:
              result,
            error:
              commitError,
          } =
            await admin.rpc(
              "platform_server_provider_sync_commit",
              {
                p_tenant_id:
                  target.tenant_id,
                p_user_id:
                  target.user_id,
                p_provider:
                  provider,
                p_sync_started_at:
                  startedAt.toISOString(),
                p_calendar_window_start:
                  hasCalendar
                    ? windowStart.toISOString()
                    : null,
                p_calendar_window_end:
                  hasCalendar
                    ? windowEnd.toISOString()
                    : null,
                p_meetings:
                  meetings,
                p_contacts:
                  contacts,
                p_contacts_full_snapshot:
                  contactsFull,
                p_sync_state:
                  syncState,
                p_new_refresh_token:
                  refreshed
                    .refreshToken,
              },
            );

                  if (commitError) {
            throw commitError;
          }

          let emailResult:
            any = {};

          if (
            capabilities.includes(
              "email",
            )
          ) {
            const {
              data:
                committedEmail,
              error:
                emailCommitError,
            } =
              await admin.rpc(
                "platform_server_provider_email_commit",
                {
                  p_tenant_id:
                    target.tenant_id,

                  p_user_id:
                    target.user_id,

                  p_provider:
                    provider,

                  p_sync_started_at:
                    startedAt
                      .toISOString(),

                  p_emails:
                    emails,
                },
              );

            if (
              emailCommitError
            ) {
              throw emailCommitError;
            }

            emailResult =
              committedEmail ||
              {};

            const captureIds =
              Array.isArray(
                emailResult
                  ?.capture_ids,
              )
                ? emailResult
                    .capture_ids
                    .map(String)
                    .filter(Boolean)
                : [];

            if (
              captureIds.length
            ) {
              EdgeRuntime.waitUntil(
                kickCaptures(
                  admin,
                  supabaseUrl,
                  captureIds,
                ),
              );
            }
          }

          return {
            ok: true,
            ...result,
            ...emailResult,
          };
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Provider sync failed";

          await admin.rpc(
            "platform_server_provider_sync_mark_error",
            {
              p_tenant_id:
                target.tenant_id,
              p_user_id:
                target.user_id,
              p_provider:
                provider,
              p_error:
                message,
            },
          );

          console.error(
            JSON.stringify({
              operation:
                "redream_provider_sync",
              provider,
              tenant_id:
                target.tenant_id,
              user_id:
                target.user_id,
              result_status:
                "failed",
              error:
                message,
            }),
          );

          return {
            ok: false,
            provider,
            error:
              message,
          };
        }
      };

    const suppliedCron =
      request.headers.get(
        "x-djm-cron",
      ) || "";

    if (suppliedCron) {
      const {
        data:
          expectedCron,
        error:
          cronError,
      } =
        await admin.rpc(
          "get_push_scheduler_secret",
        );

      if (
        cronError ||
        !expectedCron ||
        suppliedCron !==
          expectedCron
      ) {
        return json(
          {
            ok: false,
            error:
              "Unauthorized",
          },
          401,
        );
      }

      const {
        data:
          targetPayload,
        error:
          targetError,
      } =
        await admin.rpc(
          "platform_server_provider_sync_targets",
          {
            p_limit: 20,
          },
        );

      if (targetError) {
        return json(
          {
            ok: false,
            error:
              targetError.message,
          },
          500,
        );
      }

      const targets =
        Array.isArray(
          targetPayload
            ?.targets,
        )
          ? targetPayload.targets
          : [];

      const results =
        await inBatches(
          targets,
          2,
          syncOne,
        );

      return json({
        ok: true,
        mode:
          "scheduled",
        attempted:
          results.length,
        synced:
          results.filter(
            (item) =>
              item?.ok,
          ).length,
        failed:
          results.filter(
            (item) =>
              !item?.ok,
          ).length,
        results,
      });
    }

    const authHeader =
      request.headers.get(
        "Authorization",
      ) || "";

    const token =
      authHeader.replace(
        /^Bearer\s+/i,
        "",
      );

    if (!token) {
      return json(
        {
          ok: false,
          error:
            "Sign in before syncing a connected account.",
        },
        401,
      );
    }

    const {
      data: authData,
      error: authError,
    } =
      await admin.auth.getUser(
        token,
      );

    if (
      authError ||
      !authData?.user
    ) {
      return json(
        {
          ok: false,
          error:
            "Sign in before syncing a connected account.",
        },
        401,
      );
    }

    const provider =
      String(
        body?.provider || "",
      )
        .trim()
        .toLowerCase();

    if (
      provider !== "google" &&
      provider !==
        "microsoft"
    ) {
      return json(
        {
          ok: false,
          error:
            "Unsupported provider",
        },
        400,
      );
    }

    const workspaceSlug =
      String(
        body
          ?.workspace_slug ||
          "",
      ).trim();

    if (!workspaceSlug) {
      return json(
        {
          ok: false,
          error:
            "Workspace is required",
        },
        400,
      );
    }

    const userClient =
      createClient(
        supabaseUrl,
        publicKey,
        {
          global: {
            headers: {
              Authorization:
                authHeader,
              "x-redream-workspace":
                workspaceSlug,
            },
          },
          auth: {
            persistSession:
              false,
            autoRefreshToken:
              false,
          },
        },
      );

    const {
      data:
        manualContext,
      error:
        manualError,
    } =
      await userClient.rpc(
        "redream_provider_sync_context",
        {
          p_provider:
            provider,
        },
      );

    if (
      manualError ||
      !manualContext
        ?.tenant_id ||
      !manualContext
        ?.user_id
    ) {
      return json(
        {
          ok: false,
          error:
            manualError
              ?.message ||
            "Connected account is unavailable.",
        },
        403,
      );
    }

    const result =
      await syncOne({
        tenant_id:
          String(
            manualContext
              .tenant_id,
          ),
        user_id:
          String(
            manualContext
              .user_id,
          ),
        provider:
          provider as Provider,
      });

    return json(
      result,
      result.ok
        ? 200
        : 502,
    );
  },
);
