'use client';

import { FormEvent, useState } from 'react';
import {
  Camera,
  FileUp,
  MessageCircleMore,
  Paperclip,
  X,
} from 'lucide-react';

import { djmInvoke, djmRpc } from '@/lib/djm-os';

export default function DjmQuickCapture() {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState('whatsapp');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const reset = () => {
    setText('');
    setFile(null);
    setMessage('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() && !file) return;

    setBusy(true);
    setMessage('');

    try {
      if (file) {
        const form = new FormData();
        form.append('file', file);
        form.append('channel', channel);

        await djmInvoke('djm-network-capture', form);

        if (text.trim()) {
          await djmRpc('djm_network_capture_text', {
            p_text: text.trim(),
            p_channel: channel,
            p_person_id: null,
            p_organisation_id: null,
            p_occurred_at: new Date().toISOString(),
          });
        }
      } else {
        await djmInvoke('djm-network-capture', {
          text: text.trim(),
          channel,
          occurred_at: new Date().toISOString(),
        });
      }

      setMessage(
        file
          ? text.trim()
            ? 'File saved for Review. Your note was processed immediately.'
            : 'File saved safely for Review. Add a short note next time for instant structured processing.'
          : 'Captured and processed.',
      );
      window.setTimeout(() => {
        reset();
        setOpen(false);
      }, 850);
    } catch (error: any) {
      setMessage(error?.message || 'Capture failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="djm-os-capture-trigger"
        onClick={() => setOpen(true)}
        aria-label="Quick capture"
      >
        <Camera size={16} />
        <span>Capture</span>
      </button>

      {open ? (
        <div
          className="djm-os-search-overlay"
          onMouseDown={() => setOpen(false)}
        >
          <form
            className="djm-os-capture-modal"
            onSubmit={submit}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="djm-os-capture-head">
              <div>
                <strong>Quick Capture</strong>
                <p>Give DJM the conversation. Don’t update a CRM.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)}>
                <X size={17} />
              </button>
            </div>

            <div className="djm-os-capture-body">
              <label>
                Channel
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="instagram">Instagram</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="phone">Phone call</option>
                  <option value="meeting">Meeting</option>
                  <option value="email">Email</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label>
                Message or context
                <textarea
                  rows={7}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste the message, or add a short note to the screenshot/file."
                />
              </label>

              <label className="djm-os-quick-file">
                <Paperclip size={18} />
                <div>
                  <strong>{file ? file.name : 'Attach screenshot, audio or file'}</strong>
                  <span>Up to 12 MB</span>
                </div>
                <input
                  type="file"
                  accept="image/*,audio/*,video/*,.pdf,.txt,.doc,.docx"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>

              {message ? (
                <div className="djm-os-capture-status">{message}</div>
              ) : null}

              <button
                className="djm-os-primary-button"
                type="submit"
                disabled={busy || (!text.trim() && !file)}
              >
                <FileUp size={15} />
                {busy ? 'Capturing…' : 'Capture into DJM'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
