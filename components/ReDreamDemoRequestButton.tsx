'use client';

import {
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';

import { platformInvoke } from '@/lib/platform-client';
import styles from './ReDreamDemoRequestButton.module.css';

type FormState = {
  fullName: string;
  email: string;
  agencyName: string;
  websiteUrl: string;
  staffSize: string;
  playerCount: string;
  priority: string;
  consent: boolean;
  companyWebsite: string;
};

const EMPTY_FORM: FormState = {
  fullName: '',
  email: '',
  agencyName: '',
  websiteUrl: '',
  staffSize: '',
  playerCount: '',
  priority: '',
  consent: false,
  companyWebsite: '',
};

export default function ReDreamDemoRequestButton({
  className,
  label,
  requestedPlan = null,
}: {
  className?: string;
  label: string;
  requestedPlan?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [requestId, setRequestId] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) setOpen(false);
    };

    window.addEventListener('keydown', keydown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', keydown);
    };
  }, [open, submitting]);

  const openForm = () => {
    setError('');
    setSubmittedEmail('');
    setRequestId(
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : '',
    );
    setOpen(true);
  };

  const close = () => {
    if (submitting) return;
    setOpen(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (submitting) return;

    const clientRequestId =
      requestId ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : '');

    if (!clientRequestId) {
      setError('Unable to start this request. Please refresh and try again.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await platformInvoke('redream-demo-request', {
        client_request_id: clientRequestId,
        full_name: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        agency_name: form.agencyName.trim(),
        website_url: form.websiteUrl.trim() || null,
        staff_size: form.staffSize || null,
        player_count: form.playerCount || null,
        priority: form.priority.trim() || null,
        requested_plan: requestedPlan,
        consent: form.consent,
        company_website: form.companyWebsite,
        source_host: window.location.hostname,
        source_path: window.location.pathname,
        referrer: document.referrer || null,
      });

      setSubmittedEmail(form.email.trim().toLowerCase());
      setForm({ ...EMPTY_FORM });
      setRequestId(clientRequestId);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Unable to send the request. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={openForm}>
        {label}
        <ArrowRight size={15} />
      </button>

      {open ? (
        <div
          className={styles.backdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label="Request a ReDream demo"
          >
            <div className={styles.header}>
              <div>
                <p>REQUEST A DEMO</p>
                <h2>Tell us about your agency.</h2>
                <span>
                  Give us enough context to make the conversation useful from the first call.
                </span>
              </div>

              <button
                type="button"
                className={styles.close}
                onClick={close}
                disabled={submitting}
                aria-label="Close demo request"
              >
                <X size={17} />
              </button>
            </div>

            {submittedEmail ? (
              <div className={styles.success}>
                <CheckCircle2 size={26} />
                <p>REQUEST RECEIVED</p>
                <h3>We have your details.</h3>
                <span>
                  ReDream can now follow up at {submittedEmail}. Nothing has been provisioned or purchased.
                </span>
                <button type="button" onClick={close}>
                  Done
                </button>
              </div>
            ) : (
              <form className={styles.form} onSubmit={submit}>
                <div className={styles.grid}>
                  <label>
                    <span>Your name</span>
                    <input
                      required
                      minLength={2}
                      maxLength={120}
                      autoComplete="name"
                      value={form.fullName}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          fullName: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label>
                    <span>Work email</span>
                    <input
                      required
                      type="email"
                      maxLength={320}
                      autoComplete="email"
                      value={form.email}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label>
                    <span>Agency name</span>
                    <input
                      required
                      minLength={2}
                      maxLength={160}
                      autoComplete="organization"
                      value={form.agencyName}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          agencyName: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label>
                    <span>Agency website</span>
                    <input
                      type="url"
                      maxLength={500}
                      placeholder="https://"
                      value={form.websiteUrl}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          websiteUrl: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label>
                    <span>Team size</span>
                    <select
                      required
                      value={form.staffSize}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          staffSize: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select</option>
                      <option value="1-5">1-5 staff</option>
                      <option value="6-15">6-15 staff</option>
                      <option value="16-30">16-30 staff</option>
                      <option value="31+">31+ staff</option>
                    </select>
                  </label>

                  <label>
                    <span>Represented players</span>
                    <select
                      required
                      value={form.playerCount}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          playerCount: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select</option>
                      <option value="1-40">1-40 players</option>
                      <option value="41-100">41-100 players</option>
                      <option value="101-250">101-250 players</option>
                      <option value="251+">251+ players</option>
                    </select>
                  </label>

                  <label className={styles.full}>
                    <span>What would you most like ReDream to improve?</span>
                    <textarea
                      maxLength={2000}
                      rows={4}
                      value={form.priority}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          priority: event.target.value,
                        }))
                      }
                      placeholder="For example: follow-up, player service, club relationships, deal control..."
                    />
                  </label>
                </div>

                <label className={styles.consent}>
                  <input
                    required
                    type="checkbox"
                    checked={form.consent}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        consent: event.target.checked,
                      }))
                    }
                  />
                  <span>
                    I agree that ReDream Systems may use these details to respond to this demo enquiry.
                  </span>
                </label>

                <label className={styles.honeypot} aria-hidden="true">
                  Company website
                  <input
                    tabIndex={-1}
                    autoComplete="off"
                    value={form.companyWebsite}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        companyWebsite: event.target.value,
                      }))
                    }
                  />
                </label>

                {error ? <div className={styles.error}>{error}</div> : null}

                <button
                  className={styles.submit}
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? (
                    <LoaderCircle size={15} className={styles.spin} />
                  ) : (
                    <ArrowRight size={15} />
                  )}
                  Send demo request
                </button>

                <small className={styles.truth}>
                  Sending a request does not create an account, start a trial or commit your agency to a plan.
                </small>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
