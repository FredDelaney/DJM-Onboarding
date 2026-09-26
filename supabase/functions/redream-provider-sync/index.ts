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

          return {
            ok: true,
            ...result,
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
