'use client';

import {useEffect, useId, useRef, type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
import styles from './ToolsMenu.module.css';

export default function ToolsMenu({children, className, triggerClassName = '', menuClassName, label}: {
  children: ReactNode;
  className: string;
  triggerClassName?: string;
  menuClassName: string;
  label: string;
}) {
  const root = useRef<HTMLDetailsElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    const details = root.current!, menu = panel.current!, trigger = details.querySelector('summary')!;
    const nativePopover = typeof menu.showPopover === 'function';
    // Older browsers retain an in-flow disclosure instead of a clipped overlay.
    if (!nativePopover) {
      menu.removeAttribute('popover');
      Object.assign(menu.style, {position: 'static', width: '100%', maxWidth: '100%', marginTop: '8px'});
    }
    const close = (restoreFocus = false) => {
      details.open = false;
      if (nativePopover && menu.matches(':popover-open')) menu.hidePopover();
      if (restoreFocus) trigger.focus({preventScroll: true});
    };
    const position = () => {
      if (!details.open || !nativePopover || !menu.matches(':popover-open')) return;
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft || 0) + 8;
      const topEdge = (viewport?.offsetTop || 0) + 8;
      const rightEdge = leftEdge + (viewport?.width || innerWidth) - 16;
      let bottomEdge = topEdge + (viewport?.height || innerHeight) - 16;
      const navigation = document.querySelector('nav[aria-label="Mobile workspace"]')?.getBoundingClientRect();
      if (navigation?.height && navigation.top > topEdge) bottomEdge = Math.min(bottomEdge, navigation.top - 8);
      const anchor = trigger.getBoundingClientRect();
      if (anchor.bottom < topEdge || anchor.top > bottomEdge) {close(); return;}
      menu.style.maxWidth = `${Math.max(0, rightEdge - leftEdge)}px`;
      menu.style.maxHeight = `${Math.max(0, bottomEdge - topEdge)}px`;
      const full = menu.getBoundingClientRect();
      const below = Math.max(0, bottomEdge - anchor.bottom - 8);
      const above = Math.max(0, anchor.top - 8 - topEdge);
      const useBelow = full.height <= below || (full.height > above && below >= above);
      menu.style.maxHeight = `${useBelow ? below : above}px`;
      const box = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(leftEdge, Math.min(anchor.right - box.width, rightEdge - box.width))}px`;
      menu.style.top = `${Math.max(topEdge, Math.min(useBelow ? anchor.bottom + 8 : anchor.top - 8 - box.height, bottomEdge - box.height))}px`;
    };
    const toggle = () => {
      if (!details.open) {close(); return;}
      if (nativePopover && !menu.matches(':popover-open')) menu.showPopover();
      position();
      menu.querySelector<HTMLElement>('button:not(:disabled),a[href]')?.focus({preventScroll: true});
    };
    const popoverToggle = () => {if (!menu.matches(':popover-open')) details.open = false;};
    const outside = (event: Event) => {if (details.open && event.target instanceof Node && !details.contains(event.target)) close();};
    const scroll = (event: Event) => {if (!(event.target instanceof Node) || !menu.contains(event.target)) position();};
    details.addEventListener('toggle', toggle);
    menu.addEventListener('toggle', popoverToggle);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', scroll, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    const observer = new ResizeObserver(position);
    observer.observe(trigger);
    return () => {
      observer.disconnect();
      details.removeEventListener('toggle', toggle);
      menu.removeEventListener('toggle', popoverToggle);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', scroll, true);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
    };
  }, []);

  return <details ref={root} className={className}
    onClickCapture={event => {
      if ((event.target as HTMLElement).closest('button,a')) {
        root.current!.open = false;
        if (panel.current && typeof panel.current.hidePopover === 'function' && panel.current.matches(':popover-open')) panel.current.hidePopover();
      }
    }}
    onKeyDown={event => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); root.current!.open = false;
        if (panel.current && typeof panel.current.hidePopover === 'function' && panel.current.matches(':popover-open')) panel.current.hidePopover();
        root.current!.querySelector('summary')!.focus({preventScroll: true});
      }
    }}>
    <summary data-ui-button="secondary" className={triggerClassName} aria-controls={id}>More <ChevronDown size={15}/></summary>
    <div ref={panel} id={id} className={`${styles.panel} ${menuClassName}`} popover="auto" role="group" aria-label={label}>{children}</div>
  </details>;
}
